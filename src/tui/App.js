'use strict';

const React = require('react');
const { useState, useEffect, useRef } = React;
const { Box, Text, useInput, useApp } = require('ink');
const TextInput = require('ink-text-input').default;
const { marked } = require('marked');
const TerminalRenderer = require('marked-terminal');
const chalk = require('chalk');

const { shutdownMcpServers } = require("../mcp/client");
const { MODEL_MAP, resolveModel } = require("../models");
const { VALUE_TO_MODEL_ENUM } = require("../model-enum");

marked.setOptions({
  renderer: new TerminalRenderer(),
});

const App = ({ ctx, initialMessages, modelEnum, mcpData, initialModelKey, replTurn }) => {
  const [messages, setMessages] = useState(initialMessages || []);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [modelKey, setModelKey] = useState(initialModelKey);
  const { exit } = useApp();

  const modelEnumRef = useRef(modelEnum);

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === "c") {
      shutdownMcpServers(mcpData.clients).then(() => { exit(); process.exit(0); });
    }
  });

  const handleSubmit = async (value) => {
    if (isThinking) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    setInput('');

    if (trimmed.startsWith('/')) {
      const [cmd, ...args] = trimmed.slice(1).split(' ');
      if (cmd === 'clear') {
        setMessages([]);
      } else if (cmd === 'help') {
        setMessages(prev => [
          ...prev,
          { role: 'user', content: trimmed },
          { role: 'assistant', content: 'Available commands:\n/clear - Clear conversation\n/help - Show this help\n/model <name> - Switch model\n/exit, /quit - Exit' }
        ]);
      } else if (cmd === 'model') {
        const newModel = args[0];
        if (newModel) {
          const resolved = resolveModel(newModel);
          const newEnum = VALUE_TO_MODEL_ENUM[resolved && resolved.value];
          if (!newEnum) {
            setMessages(prev => [...prev, { role: "user", content: trimmed }, { role: "assistant", content: `Unknown model: ${newModel}. Run "ag models" to list available.` }]);
          } else {
            modelEnumRef.current = newEnum;
            setModelKey(newModel);
            setMessages(prev => [...prev, { role: "user", content: trimmed }, { role: "assistant", content: `Switched to ${newModel}` }]);
          }
        } else {
          setMessages(prev => [
            ...prev,
            { role: 'user', content: trimmed },
            { role: 'assistant', content: 'Usage: /model <name>' }
          ]);
        }
      } else if (cmd === 'exit' || cmd === 'quit') {
        shutdownMcpServers(mcpData.clients).then(() => { exit(); process.exit(0); });
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'user', content: trimmed },
          { role: 'assistant', content: `Unknown command: ${cmd}` }
        ]);
      }
      return;
    }

    const newMessages = [...messages, { role: 'user', content: trimmed }];
    setMessages(newMessages);
    setIsThinking(true);

    try {
      // replTurn mutates the messages array, but we want to track state updates
      // We'll wrap it to capture the updates if possible, or just rely on the fact it mutates
      // and then set state with a copy.
      await replTurn(ctx, newMessages, modelEnumRef.current, mcpData);
      setMessages([...newMessages]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      <Box marginBottom={1}>
        <Text bold>  ag</Text><Text dimColor> — Antigravity CLI</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingBottom={1}>
        {messages.map((msg, i) => (
          <Box key={i} flexDirection="column" marginBottom={1}>
            {msg.role === 'user' && (
              <Box>
                <Text color="cyan" bold>You: </Text>
                <Text>{msg.content}</Text>
              </Box>
            )}
            {msg.role === 'assistant' && (
              <Box flexDirection="column">
                {msg.content && <Text>{marked(msg.content).trim()}</Text>}
                {msg.tool_calls && msg.tool_calls.map((tc, j) => (
                  <Text key={j} color="magenta" dim>
                    ⚙ {tc.name} {JSON.stringify(tc.args_parsed || tc.arguments)}
                  </Text>
                ))}
              </Box>
            )}
            {msg.role === 'tool' && (
              <Box>
                <Text color="magenta" dim>⚙ {msg.name} result</Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      <Box flexDirection="column">
        <Box>
          <Box flexGrow={1}>
            <Text color="gray" dim>{modelKey}</Text>
          </Box>
          {isThinking && (
            <Box>
              <Text color="gray" dim>thinking...</Text>
            </Box>
          )}
        </Box>
        <Box>
          <Text color="cyan" bold>❯ </Text>
          <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
        </Box>
      </Box>
    </Box>
  );
};

module.exports = App;

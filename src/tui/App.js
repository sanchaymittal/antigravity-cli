'use strict';

const React = require('react');
const { useState, useEffect, useRef, useMemo } = React;
const { Box, Text, useInput, useApp, useStdout } = require('ink');
const TextInput = require('ink-text-input').default;
const { marked } = require('marked');
const TerminalRenderer = require('marked-terminal');
const chalk = require('chalk');
const os = require('os');
const { execSync } = require('child_process');

const { shutdownMcpServers } = require("../mcp/client");
const { resolveModel } = require("../models");
const { VALUE_TO_MODEL_ENUM } = require("../model-enum");
const pkg = require('../../package.json');

marked.setOptions({
  renderer: new TerminalRenderer(),
});

const App = ({ ctx, initialMessages, modelEnum, mcpData, initialModelKey, replTurn }) => {
  const [messages, setMessages] = useState(initialMessages || []);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [modelKey, setModelKey] = useState(initialModelKey);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const { exit } = useApp();
  const { stdout } = useStdout();

  const modelEnumRef = useRef(modelEnum);
  const terminalWidth = stdout?.columns || 80;
  const terminalHeight = stdout?.rows || 24;

  const home = os.homedir();
  const cwd = process.cwd();
  const displayCwd = cwd.startsWith(home) ? cwd.replace(home, '~') : cwd;

  const [branch, setBranch] = useState('main');
  useEffect(() => {
    try {
      const b = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      setBranch(b);
    } catch (e) {}
  }, []);

  const headerHeight = 3;
  const inputHeight = 3;
  const statusHeight = 1;
  const chatHeight = terminalHeight - headerHeight - inputHeight - statusHeight;

  const allLines = useMemo(() => {
    const lines = [];
    messages.forEach((msg) => {
      if (msg.role === 'user') {
        lines.push(chalk.gray(`> ${msg.content}`));
      } else if (msg.role === 'assistant') {
        if (msg.content) {
          const rendered = marked(msg.content).trim();
          rendered.split('\n').forEach((line, idx) => {
            if (idx === 0) {
              lines.push(chalk.cyan('◆ ') + chalk.white(line));
            } else {
              lines.push('  ' + chalk.white(line));
            }
          });
        }
        if (msg.tool_calls) {
          msg.tool_calls.forEach(tc => {
            lines.push(chalk.magenta.dim(`  ⚙ ${tc.name} ${JSON.stringify(tc.args_parsed || tc.arguments)}`));
          });
        }
      } else if (msg.role === 'tool') {
        lines.push(chalk.magenta.dim(`  ⚙ ${msg.name} result`));
      } else if (msg.role === 'error') {
        lines.push(chalk.red(`Error: ${msg.content}`));
      }
    });
    if (isThinking) {
      lines.push(chalk.cyan('◆ ') + chalk.gray('thinking...'));
    }
    return lines;
  }, [messages, isThinking]);

  const maxScroll = Math.max(0, allLines.length - chatHeight);
  
  useEffect(() => {
    if (autoScroll) {
      setScrollOffset(maxScroll);
    }
  }, [allLines.length, maxScroll, autoScroll]);

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === "c") {
      shutdownMcpServers(mcpData.clients).then(() => { exit(); process.exit(0); });
    }
    
    if (key.upArrow) {
      setAutoScroll(false);
      setScrollOffset(prev => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setScrollOffset(prev => {
        const next = prev + 1;
        if (next >= maxScroll) {
          setAutoScroll(true);
          return maxScroll;
        }
        return next;
      });
    }
    if (key.pageUp) {
      setAutoScroll(false);
      setScrollOffset(prev => Math.max(0, prev - chatHeight));
    }
    if (key.pageDown) {
      setScrollOffset(prev => {
        const next = prev + chatHeight;
        if (next >= maxScroll) {
          setAutoScroll(true);
          return maxScroll;
        }
        return next;
      });
    }
  });

  const handleSubmit = async (value) => {
    if (isThinking) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    setInput('');
    setAutoScroll(true);

    if (trimmed.startsWith('/')) {
      const [cmd, ...args] = trimmed.slice(1).split(' ');
      if (cmd === 'clear') {
        setMessages([]);
        setScrollOffset(0);
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
      await replTurn(ctx, newMessages, modelEnumRef.current, mcpData);
      setMessages([...newMessages]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsThinking(false);
    }
  };

  const visibleLines = allLines.slice(scrollOffset, scrollOffset + chatHeight);

  return (
    <Box flexDirection="column" height={terminalHeight}>
      {/* HEADER */}
      <Box flexDirection="column" paddingX={1} height={headerHeight}>
        <Box>
          <Text>🤖 <Text bold>antigravity-cli</Text> <Text dimColor> v{pkg.version}</Text></Text>
        </Box>
        <Box>
          <Text dimColor>{modelKey} · {displayCwd}</Text>
        </Box>
        <Text dimColor>{"─".repeat(Math.max(0, terminalWidth - 2))}</Text>
      </Box>

      {/* CONVERSATION AREA */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {visibleLines.map((line, i) => (
          <Text key={i} wrap="truncate-end">{line}</Text>
        ))}
        {scrollOffset > 0 && (
          <Box position="absolute" top={headerHeight} right={2}>
            <Text yellow>↑ {scrollOffset} more</Text>
          </Box>
        )}
        {allLines.length > scrollOffset + chatHeight && (
          <Box position="absolute" bottom={inputHeight + statusHeight} right={2}>
            <Text yellow>↓ {allLines.length - (scrollOffset + chatHeight)} more</Text>
          </Box>
        )}
      </Box>

      {/* INPUT ROW */}
      <Box flexDirection="column" height={inputHeight}>
        <Text dimColor>{"─".repeat(terminalWidth)}</Text>
        <Box paddingX={1}>
          <Text color="yellow" bold>{"> "}</Text>
          <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
        </Box>
        <Text dimColor>{"─".repeat(terminalWidth)}</Text>
      </Box>

      {/* STATUSBAR */}
      <Box justifyContent="space-between" paddingX={1} height={statusHeight}>
        <Box>
          <Text color={mcpData.clients.length > 0 ? "green" : "yellow"}>● </Text>
          <Text>MCP: {mcpData.clients.length}</Text>
        </Box>
        <Box>
          <Text> {branch} · {modelKey}</Text>
        </Box>
      </Box>
    </Box>
  );
};

module.exports = App;

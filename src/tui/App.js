'use strict';

const React = require('react');
const { useState, useEffect, useRef, useMemo } = React;
const { Box, Text, useInput, useApp, useStdout } = require('ink');
const TextInput = require('ink-text-input').default;
const { marked } = require('marked');
const TerminalRenderer = require('marked-terminal');
const os = require('os');
const { exec } = require('child_process');
const figlet = require("figlet");

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
    exec('git rev-parse --abbrev-ref HEAD', (err, stdout) => { if (!err) setBranch(stdout.trim()); });
  }, []);

  const bannerText = figlet.textSync("antigravity", { font: "Slant" });
  const bannerLineCount = bannerText.split("\n").length;
  const headerHeight = bannerLineCount + 2; // +1 meta line, +1 separator

  const inputHeight = 3;
  const statusHeight = 1;
  const chatHeight = terminalHeight - headerHeight - inputHeight - statusHeight;

  const allLines = useMemo(() => {
    const lines = [];
    messages.forEach((msg) => {
      if (msg.role === 'user') {
        lines.push({ text: `> ${msg.content}`, color: 'gray' });
      } else if (msg.role === 'assistant') {
        if (msg.content) {
          const rendered = marked(msg.content).trim();
          rendered.split('\n').forEach((line, idx) => {
            if (idx === 0) {
              lines.push({ text: line, color: 'white', prefix: '◆ ', prefixColor: 'cyan' });
            } else {
              lines.push({ text: line, color: 'white', prefix: '  ' });
            }
          });
        }
        if (msg.tool_calls) {
          msg.tool_calls.forEach(tc => {
            lines.push({ text: `  ⚙ ${tc.name} ${JSON.stringify(tc.args_parsed || tc.arguments)}`, color: 'magenta', dim: true });
          });
        }
      } else if (msg.role === 'tool') {
        lines.push({ text: `  ⚙ ${msg.name} result`, color: 'magenta', dim: true });
      } else if (msg.role === 'error') {
        lines.push({ text: `Error: ${msg.content}`, color: 'red' });
      }
    });
    if (isThinking) {
      lines.push({ text: 'thinking...', color: 'gray', prefix: '◆ ', prefixColor: 'cyan' });
    }
    return lines;
  }, [messages, isThinking]);

  const maxScroll = Math.max(0, allLines.length - chatHeight);
  const maxScrollRef = useRef(0);
  maxScrollRef.current = maxScroll;
  
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
        if (next >= maxScrollRef.current) {
          setAutoScroll(true);
          return maxScrollRef.current;
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
        if (next >= maxScrollRef.current) {
          setAutoScroll(true);
          return maxScrollRef.current;
        }
        return next;
      });
    }
  }, { isActive: !isThinking });

  const handleSubmit = async (value) => {
    const trimmed = value.trim();
    if (isThinking || !trimmed) return;
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

  const headerMeta = `${modelKey} · ${displayCwd}`;
  const maxMeta = terminalWidth - 4;
  const displayMeta = headerMeta.length > maxMeta ? headerMeta.slice(0, maxMeta - 1) + "…" : headerMeta;

  return (
    <Box flexDirection="column" height={terminalHeight}>
      {/* HEADER */}
      <Box flexDirection="column" paddingX={1} height={headerHeight}>
        {bannerText.split("\n").map((line, i) => (
          <Text key={i} color="cyan" bold>{line}</Text>
        ))}
        <Text dimColor>{displayMeta}</Text>
        <Text dimColor>{"─".repeat(Math.max(0, terminalWidth - 2))}</Text>
      </Box>

      {/* CONVERSATION AREA */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {scrollOffset > 0 && <Box><Text color="yellow">↑ {scrollOffset} more above</Text></Box>}
        {allLines.length > scrollOffset + chatHeight && <Box><Text color="yellow">↓ {allLines.length - scrollOffset - chatHeight} more below</Text></Box>}
        {visibleLines.map((line, i) => (
          <Box key={i}>
            {line.prefix && <Text color={line.prefixColor}>{line.prefix}</Text>}
            <Text color={line.color} dimColor={line.dim} bold={line.bold}>{line.text}</Text>
          </Box>
        ))}
      </Box>

      {/* INPUT ROW */}
      <Box flexDirection="column" height={inputHeight}>
        <Text color="cyan">{"─".repeat(terminalWidth)}</Text>
        <Box paddingX={1}>
          <Text color="yellow" bold>{"> "}</Text>
          <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
        </Box>
        <Text color="cyan">{"─".repeat(terminalWidth)}</Text>
      </Box>

      {/* STATUSBAR */}
      <Box justifyContent="space-between" paddingX={1} height={statusHeight}>
        <Box>
          <Text color={mcpData.clients.length > 0 ? "green" : "yellow"}>● </Text>
          <Text>MCP: {mcpData.clients.length}</Text>
        </Box>
        <Box>
          <Text> <Text color="cyan">{branch}</Text> · {modelKey}</Text>
        </Box>
      </Box>
    </Box>
  );
};

module.exports = App;

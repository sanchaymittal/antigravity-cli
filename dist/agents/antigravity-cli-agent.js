"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AntigravityCliAgent = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const constants_1 = require("./constants");
const AGENT_BOOTSTRAP_RULES = [
    '# Agent Rules',
    '',
    '1. Use tools to complete the task — read files, write files, run commands as needed.',
    '2. When your work is complete, call task_complete with a summary of what you did.',
    '3. Do not ask for clarification — proceed with reasonable assumptions.',
    '4. Do not hallucinate tool results — wait for real observations before continuing.',
].join('\n');
class AntigravityCliAgent {
    constructor(model = 'antigravity-claude-sonnet-4-6') {
        this.model = model;
        this.name = 'antigravity';
    }
    available() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                (0, child_process_1.execSync)(`node ${path.join(process.cwd(), 'src', 'cli.js')} run --help 2>&1`, { stdio: 'pipe' });
                return true;
            }
            catch (_a) {
                return false;
            }
        });
    }
    isOneShot() {
        return true;
    }
    bootstrap(sandboxRoot) {
        return __awaiter(this, void 0, void 0, function* () {
            fs.writeFileSync(path.join(sandboxRoot, 'AGENTS.md'), AGENT_BOOTSTRAP_RULES);
        });
    }
    start(sessionId, mcpUrl, intent, workdir) {
        return __awaiter(this, void 0, void 0, function* () {
            if (workdir) {
                const agDir = path.join(workdir, '.ag');
                fs.mkdirSync(agDir, { recursive: true });
                fs.writeFileSync(path.join(agDir, 'mcp.json'), JSON.stringify({
                    mcpServers: {
                        chanakya: {
                            command: 'npx',
                            args: ['-y', 'mcp-remote', `${mcpUrl}/mcp`, '--allow-http', '--transport', 'http-only'],
                        },
                    },
                }, null, 2));
            }
            return (0, child_process_1.spawn)('ag', ['run', '-m', this.model, intent], {
                cwd: workdir,
                stdio: constants_1.AGENT_STDIO_CONFIG,
                env: Object.assign({}, process.env),
            });
        });
    }
}
exports.AntigravityCliAgent = AntigravityCliAgent;

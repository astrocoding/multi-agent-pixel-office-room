export interface ParsedCommand {
  isCommand: boolean;
  commandName: string;
  args: string[];
  rawArgs: string;
}

export class CommandParser {
  public static parse(text: string): ParsedCommand {
    if (!text || typeof text !== 'string') {
      return { isCommand: false, commandName: '', args: [], rawArgs: '' };
    }

    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) {
      return { isCommand: false, commandName: '', args: [], rawArgs: trimmed };
    }

    const spaceIndex = trimmed.indexOf(' ');
    let fullCommand = spaceIndex === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIndex);
    const rawArgs = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1).trim();

    // Strip @bot_username if present (e.g. /start@MyAgentBot -> start)
    const atIndex = fullCommand.indexOf('@');
    if (atIndex !== -1) {
      fullCommand = fullCommand.slice(0, atIndex);
    }

    const commandName = fullCommand.toLowerCase();
    const args = rawArgs.length > 0 ? rawArgs.split(/\s+/) : [];

    return {
      isCommand: true,
      commandName,
      args,
      rawArgs,
    };
  }
}


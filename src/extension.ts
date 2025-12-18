import * as vscode from 'vscode';
import { html as beautifyHtml } from 'js-beautify';

export function activate(context: vscode.ExtensionContext) {
	const formatter = vscode.languages.registerDocumentFormattingEditProvider('eta', {
		provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
			const config = vscode.workspace.getConfiguration('eta');
			const indentationType = config.get<string>('indentationType', 'spaces');
			const tabSize = config.get<number>('tabSize', 2);
			const formatted = formatEtaTemplate(document.getText(), indentationType, tabSize);
			const fullRange = new vscode.Range(
				document.positionAt(0),
				document.positionAt(document.getText().length)
			);
			return [vscode.TextEdit.replace(fullRange, formatted)];
		}
	});

	const command = vscode.commands.registerCommand('eta.format', () => {
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.document.languageId === 'eta') {
			vscode.commands.executeCommand('editor.action.formatDocument');
		}
	});

	context.subscriptions.push(formatter, command);
}

function formatEtaTemplate(content: string, indentationType: string, tabSize: number): string {
	// Step 1: Protect Eta tags by replacing them with placeholders
	const etaTagMap: Map<string, string> = new Map();
	let placeholderIndex = 0;

	const protectedContent = content.replace(/<%[\s\S]*?%>/g, (match) => {
		const placeholder = `___ETA_PLACEHOLDER_${placeholderIndex}___`;
		etaTagMap.set(placeholder, match);
		placeholderIndex++;
		return placeholder;
	});

	// Step 2: Format HTML using js-beautify
	const beautified = beautifyHtml(protectedContent, {
		indent_size: indentationType === 'tabs' ? 1 : tabSize,
		indent_char: indentationType === 'tabs' ? '\t' : ' ',
		wrap_line_length: 0,
		preserve_newlines: true,
		max_preserve_newlines: 2,
		indent_inner_html: true,
		end_with_newline: false,
		unformatted: [],
		content_unformatted: ['pre', 'textarea']
	});

	// Step 3: Restore Eta tags
	let result = beautified;
	etaTagMap.forEach((original, placeholder) => {
		result = result.replace(placeholder, original);
	});

	// Step 4: Fix indentation for Eta control structures
	result = adjustEtaIndentation(result, indentationType, tabSize);

	return result;
}

function adjustEtaIndentation(content: string, indentationType: string, tabSize: number): string {
	const lines = content.split('\n');
	const formatted: string[] = [];
	const indent = indentationType === 'tabs' ? '\t' : ' '.repeat(tabSize);
	let etaIndentAdjustment = 0;

	for (let line of lines) {
		const trimmed = line.trim();

		// Check for else statement (closes one block, opens another)
		if (isElseStatement(trimmed)) {
			etaIndentAdjustment--;
		}
		// Check for other Eta closing tags
		else if (isEtaClosing(trimmed)) {
			etaIndentAdjustment--;
		}

		// Get base indentation from HTML formatter
		const baseIndent = line.match(/^[\t ]*/)?.[0] || '';
		const baseIndentLevel = indentationType === 'tabs'
			? baseIndent.length
			: Math.floor(baseIndent.length / tabSize);

		// Apply Eta adjustment
		const totalIndent = Math.max(0, baseIndentLevel + etaIndentAdjustment);
		formatted.push(indent.repeat(totalIndent) + trimmed);

		// Check for Eta opening tags (including else which opens after closing)
		if (isEtaOpening(trimmed)) {
			etaIndentAdjustment++;
		}
	}

	return formatted.join('\n');
}

function isEtaOpening(line: string): boolean {
	// Check for opening control structures
	return /<%~?\s*(if|foreach|for|while|each)\s*\(/.test(line) ||
		/<%~?\s*.*=>\s*\{\s*%>/.test(line) ||
		isElseStatement(line);
}

function isEtaClosing(line: string): boolean {
	// Check for closing braces, but not else statements
	if (isElseStatement(line)) {
		return false;
	}
	return /<%~?\s*}[\s)]*;?\s*%>/.test(line);
}

function isElseStatement(line: string): boolean {
	// Matches: <% } else { %> or <% } else if (...) { %>
	return /<%~?\s*}\s*else(\s+if\s*\([^)]*\))?\s*\{\s*%>/.test(line);
}

export function deactivate() { }
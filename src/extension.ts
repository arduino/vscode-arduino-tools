import vscode from 'vscode';
import { activateDebug } from './debug';
import { activateIno } from './ino';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(activateIno(context), activateDebug(context));
}

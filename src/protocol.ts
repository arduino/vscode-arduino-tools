import { NotificationType, DocumentUri } from 'vscode-languageclient';

export interface DidCompleteBuildParams {
    readonly buildOutputUri: DocumentUri;
}
export namespace DidCompleteBuildNotification {
    export const TYPE = new NotificationType<DidCompleteBuildParams, void>('ino/didCompleteBuild');
}

export type ActorRole = 'owner' | 'operator' | 'user';

export interface TelegramActor {
  telegramUserId: number;
  telegramUsername?: string;
  chatId: number;
  chatType: 'private' | 'group' | 'supergroup' | 'channel';
  role: ActorRole;
  actorId: string;
  isOwner: boolean;
  isAuthorized: boolean;
}


import { parseOwnerUserIds, parseAllowedUserIds, parseGroupIds } from '../../../config/env.js';
import type { TelegramActor, ActorRole } from '../domain/identityTypes.js';

export class IdentityService {
  public static resolveActor(
    userId: number,
    chatId: number,
    chatType: 'private' | 'group' | 'supergroup' | 'channel' = 'private',
    username?: string
  ): TelegramActor {
    const ownerIds = parseOwnerUserIds();
    const allowedIds = parseAllowedUserIds();
    const groupIds = parseGroupIds();

    let role: ActorRole = 'user';
    let isOwner = false;
    let isAuthorized = false;

    // Strict Owner check: Must be explicitly listed in ownerIds (from BOSS_ID / TELEGRAM_OWNER_USER_IDS)
    if (ownerIds.includes(userId)) {
      role = 'owner';
      isOwner = true;
      isAuthorized = true;
    } else if (allowedIds.includes(userId)) {
      role = 'operator';
      isAuthorized = true;
    }

    // Default to private chat only; group chats are restricted unless explicitly in configured groupIds
    if (chatType !== 'private' && !isOwner && !groupIds.includes(chatId)) {
      isAuthorized = false;
    }

    const actorId = isOwner ? 'boss' : `telegram_user_${userId}`;

    return {
      telegramUserId: userId,
      telegramUsername: username,
      chatId,
      chatType,
      role,
      actorId,
      isOwner,
      isAuthorized,
    };
  }
}


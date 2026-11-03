# Tarot Kingdom: major arcana replies to aces

New matches use `majorArcanaGateVersion: 2` and network schema 37. Tower, Star, Moon and Sun may be played against a single field card of their corresponding suit: Sword, Cup, Pentacle and Wand respectively, including aces. Their existing opening exception for a player's last card and existing rules for suitless cards and the Magician are unchanged. All other existing restrictions, including single-card count, suit lock and reverse strength, still apply. Other major cards remain unable to answer an ace.

States restored from schema 36 or earlier retain gate version 0 or 1 and the previous ace rule. The host rebuilds and validates actions using the same rule version that drives local move availability and NPC move generation. No server route or player-data migration is added.

Schema-37 rooms use the `tkv37_` room ID prefix and the `tarotKingdomRoomsV37` / `tarotKingdomMatchV37` paths. Old clients continue to use the original paths, so an old client cannot discover or take over a new room through its existing app code. New clients can still reconnect to original rooms, which retain the old rule. Exploration and combat profile endpoints select the same path from the room ID. Rolling back while a schema-37 room is active separates the rolled-back client from that room; players must update again to reconnect. Existing completed player data is unchanged.

The deployed Realtime Database rules, read from the existing Firebase console on 2026-11-03, allow authenticated reads and writes at the root. This release does not change those permissions. The repository's `database.rules.json` is not the deployed rules and rejects the currently used state schema, so it must not be deployed as a replacement without a separate reconciliation and review.

## World after a suited major

Judgement and World can each answer one of these four major cards in normal order, provided the existing restrictions permit it. A suit lock blocks these suitless cards. World ordinarily clears the field immediately; however, in the ordinary match an empty hand can end the round before a subsequent player can answer. The five-card World call has its own existing validation.

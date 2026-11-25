# Nour Security Specification

## Data Invariants
1. Every document in `/users/{uid}` and its subcollections (`bookmarks`, `memorization`, `favoriteRadios`) belongs strictly to `uid == request.auth.uid`.
2. Users cannot read, list, create, update, or delete another user's profile, bookmarks, memorization items, or favorite radios.
3. All writes require `request.auth != null && request.auth.token.email_verified == true` and strict document ID validation (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
4. `createdAt` and `uid` are immutable after document creation. `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
5. No shadow/ghost fields allowed (`keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` on update).
6. `/appConfig/appearance` is publicly readable (`get` only) so every visitor sees the active wallpaper, while `create`/`update` require verified Admin (`email_verified == true` and root admin email or `/admins/{uid}`).
7. `/visits/{visitId}` permits anonymous `create` with strict field schema, zero PII, and `createdAt == request.time`, while `get`/`list`/`delete` are restricted strictly to verified Admin.

## Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read on `/users/user1`.
2. Cross-user read on `/users/user2` while signed in as `user1`.
3. Unverified email write on `/users/user1` (`email_verified: false`).
4. Cross-user bookmark create `/users/user2/bookmarks/2_255` by `user1`.
5. Identity spoofing in payload (`uid: "user2"` inside `/users/user1`).
6. Shadow field injection (`isAdmin: true`) in `/users/user1` create or update.
7. Oversized `bookmarkId` (> 128 chars) or invalid characters (`../bad`).
8. Oversized `note` (> 1000 chars) on `/users/user1/bookmarks/1_1`.
9. Invalid `highlightColor: "neon_pink"` outside allowed enum.
10. Backdated `createdAt` or `updatedAt` timestamp not equal to `request.time`.
11. Unprivileged user attempting to update `/appConfig/appearance` or read/list `/visits`.
12. Spoofed admin token (`email == "ywsfkrt300@gmail.com"` with `email_verified == false`) attempting admin read/write.


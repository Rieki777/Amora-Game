-- 0051: read the event spine BY NODE.
--
-- The per-node change journal is a read, not a new table. health_events
-- already carries who, what, when, which entity and which audience, and
-- ARCHITECTURE.md invariant 15 is explicit that a second event mechanism is a
-- bug by definition. What it lacked was an index to ask "everything that ever
-- happened to THIS seat" without scanning.
--
-- The existing indexes are (audience, at), (actor_user_id, at) and (kind, at):
-- all fine for a feed, none for a node. Opening one seat's history would have
-- read the whole table, and this is the table every module appends to.
ALTER TABLE `health_events`
  ADD KEY `health_events_entity_idx` (`entity_type`, `entity_ref`, `at`);

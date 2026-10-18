-- Own migration: a new enum value cannot be used in the transaction that adds it.
alter type public.task_event_type add value if not exists 'recurrence_changed';

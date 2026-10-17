-- TASK-016: mark the owner's own test companies so reports skip them.
ALTER TABLE "companies" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;
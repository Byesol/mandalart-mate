CREATE TABLE mate_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE mate_links (
  low TEXT NOT NULL REFERENCES mate_profiles(id),
  high TEXT NOT NULL REFERENCES mate_profiles(id),
  requester TEXT NOT NULL REFERENCES mate_profiles(id),
  status TEXT NOT NULL CHECK(status IN ('pending','accepted')),
  PRIMARY KEY (low, high)
);
--> statement-breakpoint
CREATE TABLE mate_posts (
  owner TEXT NOT NULL REFERENCES mate_profiles(id),
  receiver TEXT NOT NULL REFERENCES mate_profiles(id),
  goal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  area TEXT NOT NULL,
  tint INTEGER NOT NULL,
  done_at TEXT,
  allow_photo INTEGER NOT NULL DEFAULT 0,
  has_photo INTEGER NOT NULL DEFAULT 0,
  cheer TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner, receiver, goal_id)
);
--> statement-breakpoint
CREATE INDEX mate_posts_receiver ON mate_posts(receiver, updated_at);
--> statement-breakpoint
CREATE INDEX mate_links_high ON mate_links(high);

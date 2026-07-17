import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sweep expired floor holds",
  { seconds: 5 },
  internal.maintenance.sweepFloor,
  {},
);

crons.interval(
  "sweep stale members and signals",
  { seconds: 30 },
  internal.maintenance.sweepStale,
  {},
);

// Seed today's checklist from the template (~5am ET; lazy ensureToday backstops).
crons.daily(
  "seed daily checklist",
  { hourUTC: 9, minuteUTC: 30 },
  internal.tasks.seedToday,
  {},
);

export default crons;

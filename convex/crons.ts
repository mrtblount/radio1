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

export default crons;

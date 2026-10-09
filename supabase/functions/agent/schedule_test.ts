// Run with: deno test supabase/functions/agent/schedule_test.ts
import { computeSchedule, fromDay } from "./schedule.ts";
const wp = (id: string, ps: string | null, pe: string | null, extra: Record<string, unknown> = {}) => ({
  id, wp_number: id, title: id, discipline: "RIGGING", status: "DRAFT",
  planned_start: ps, planned_end: pe, actual_start: null, actual_end: null,
  baseline_start: null, baseline_end: null, ...extra,
});
function eq(a: unknown, b: unknown, msg: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); }

Deno.test("FS chain pushes successor, critical path, float", () => {
  const r = computeSchedule({
    today: "2026-10-01",
    workPackages: [wp("A", "2026-10-13", "2026-10-17"), wp("B", "2026-10-13", "2026-10-14"), wp("C", "2026-10-13", "2026-10-13")],
    dependencies: [{ predecessor_id: "A", successor_id: "B", kind: "FS", lag_days: 0 }],
  });
  eq(fromDay(r.byId.B.forecastStart!), "2026-10-18", "B starts after A");
  eq(fromDay(r.byId.B.forecastEnd!), "2026-10-19", "B keeps 2-day duration");
  eq(r.byId.B.drivenBy, "A", "driver");
  eq([r.byId.A.critical, r.byId.B.critical, r.byId.C.critical], [true, true, false], "critical");
  eq(r.byId.C.floatDays, 6, "C float");
  eq(r.byId.B.slipDays, 5, "B slip vs planned");
});
Deno.test("SS with lag, change-order delay, late start, overdue, complete", () => {
  const r = computeSchedule({
    today: "2026-10-20",
    workPackages: [
      wp("A", "2026-10-21", "2026-10-25"),
      wp("B", "2026-10-21", "2026-10-22"),
      wp("L", "2026-10-10", "2026-10-12"),
      wp("O", "2026-10-10", "2026-10-12", { status: "ACTIVE", actual_start: "2026-10-10" }),
      wp("D", "2026-10-01", "2026-10-03", { status: "COMPLETE", actual_start: "2026-10-02", actual_end: "2026-10-05" }),
      wp("U", null, null),
    ],
    dependencies: [{ predecessor_id: "A", successor_id: "B", kind: "SS", lag_days: 2 }],
    delays: [{ work_package_id: "A", days: 3, source: "CO-2026-001", pending: true }],
  });
  eq(fromDay(r.byId.A.forecastEnd!), "2026-10-28", "A +3 days CO");
  eq(r.byId.A.awaitingApproval, true, "awaiting approval");
  eq(fromDay(r.byId.B.forecastStart!), "2026-10-23", "B SS+2");
  eq([r.byId.L.lateStart, fromDay(r.byId.L.forecastStart!), fromDay(r.byId.L.forecastEnd!)], [true, "2026-10-20", "2026-10-22"], "late start");
  eq([r.byId.O.overdue, fromDay(r.byId.O.forecastEnd!)], [true, "2026-10-20"], "overdue");
  eq([fromDay(r.byId.D.forecastEnd!), r.byId.D.critical], ["2026-10-05", false], "complete uses actual");
  eq(r.unscheduled, ["U"], "unscheduled");
  eq(fromDay(r.forecastFinish!), "2026-10-28", "finish");
});

Deno.test("work under way finishes on its planned end, whatever its planned start", () => {
  const r = computeSchedule({
    today: "2026-10-08",
    workPackages: [
      // Started a week late: the planned end still holds.
      wp("S", "2026-10-01", "2026-10-20", { status: "ACTIVE", actual_start: "2026-10-08" }),
      // A planned start later than the actual one (the bug that left WP-MECH-001
      // planned for November while under way since October) does not matter.
      wp("M", "2026-11-13", "2026-12-10", { status: "ACTIVE", actual_start: "2026-10-06" }),
      // Change-order days still add on at the end.
      wp("C", "2026-10-01", "2026-10-20", { status: "ACTIVE", actual_start: "2026-10-01" }),
    ],
    dependencies: [],
    delays: [{ work_package_id: "C", days: 2, source: "CO-1", pending: false }],
  });
  eq([fromDay(r.byId.S.forecastStart!), fromDay(r.byId.S.forecastEnd!)], ["2026-10-08", "2026-10-20"], "late start keeps the planned end");
  eq([fromDay(r.byId.M.forecastStart!), fromDay(r.byId.M.forecastEnd!)], ["2026-10-06", "2026-12-10"], "actual start to planned end");
  eq(fromDay(r.byId.C.forecastEnd!), "2026-10-22", "CO days on top");
});

Deno.test("a drop stores the plan that puts the bar where it was dropped", async () => {
  const { planForDrop, toDay } = await import("./schedule.ts");
  const today = "2026-10-08";
  const r = computeSchedule({
    today,
    workPackages: [
      wp("N", "2026-10-20", "2026-10-24"),                       // ordinary
      wp("L", "2026-09-27", "2026-10-01"),                       // late to start: drawn from today
      wp("M", "2026-11-13", "2026-12-10", { status: "ACTIVE", actual_start: "2026-10-06" }), // under way
      wp("C", "2026-10-20", "2026-10-24"),                       // carries 3 change-order days
    ],
    dependencies: [],
    delays: [{ work_package_id: "C", days: 3, source: "CO-1", pending: false }],
  });
  const t = toDay(today)!;
  const d = (n: number) => fromDay(n);
  const plan = (id: string, mode: "move" | "start" | "end", delta: number) => {
    const p = planForDrop(r.byId[id], mode, delta, t)!;
    return [d(p.start), d(p.end)];
  };
  eq(plan("N", "move", 7), ["2026-10-27", "2026-10-31"], "plain move");
  // L is drawn 8–12 Oct; dropped a week later it must start on the 15th, not
  // its old planned start plus a week (4 Oct, in the past).
  eq(plan("L", "move", 7), ["2026-10-15", "2026-10-19"], "late start moves from where it is drawn");
  eq(plan("L", "move", -20), ["2026-10-08", "2026-10-12"], "not before today");
  // M is drawn 6 Oct–10 Dec; dragging its end back 10 days ends it on 30 Nov.
  eq(plan("M", "end", -10), ["2026-10-06", "2026-11-30"], "under way: end moves, start set to the actual start");
  eq(plan("M", "move", -10), ["2026-10-06", "2026-11-30"], "under way: a move moves the end only");
  eq(planForDrop(r.byId.M, "start", 3, t), null, "under way: start is fixed");
  eq(plan("M", "end", -70), ["2026-10-06", "2026-10-06"], "end not before the actual start");
  // C is drawn 20–27 Oct (5 planned + 3 CO days); its stored plan excludes them.
  eq(plan("C", "move", 2), ["2026-10-22", "2026-10-26"], "CO days stay on the end");
  eq(plan("C", "end", 2), ["2026-10-20", "2026-10-26"], "resize end with CO days");
  // Saving the plan and recomputing lands the bar exactly where it was dropped.
  const moved = computeSchedule({
    today,
    workPackages: [wp("L", "2026-10-15", "2026-10-19"), wp("C", "2026-10-22", "2026-10-26")],
    dependencies: [],
    delays: [{ work_package_id: "C", days: 3, source: "CO-1", pending: false }],
  });
  eq([d(moved.byId.L.forecastStart!), d(moved.byId.L.forecastEnd!)], ["2026-10-15", "2026-10-19"], "L lands on the drop");
  eq([d(moved.byId.C.forecastStart!), d(moved.byId.C.forecastEnd!)], ["2026-10-22", "2026-10-29"], "C lands on the drop");
});

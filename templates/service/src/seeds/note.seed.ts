import type { Seed } from "@driversim/postgres";

/** Fixed ids so the seed is idempotent and easy to reference from Postman. */
export const DEMO_SCHOOL_ID = "01928c7e-0000-7000-8000-00000000000a";
export const DEMO_USER_ID = "01928c7e-0000-7000-8000-0000000000aa";

const DEMO_NOTES = [
  {
    id: "01928c7e-0000-7000-8000-000000000001",
    title: "Welcome to DriverSim",
    body: "Theory classes start Monday at 08:30.",
  },
  {
    id: "01928c7e-0000-7000-8000-000000000002",
    title: "Practice schedule",
    body: "Bring your learner permit to every practical session.",
  },
];

/** EXAMPLE DOMAIN demo data (development only). */
export const noteSeed: Seed = {
  name: "demo-notes",
  environments: ["development"],
  async run({ sql, clock }) {
    const now = clock.now();
    for (const note of DEMO_NOTES) {
      await sql`
        insert into notes (id, school_id, title, body, created_by, created_at, updated_at, version)
        values (${note.id}, ${DEMO_SCHOOL_ID}, ${note.title}, ${note.body}, ${DEMO_USER_ID}, ${now}, ${now}, 1)
        on conflict (id) do nothing`;
    }
  },
};

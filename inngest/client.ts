import { Inngest } from "inngest";

// Single shared Inngest client. The id is the app's namespace in the Inngest
// dashboard / dev server.
export const inngest = new Inngest({ id: "schoolreach" });

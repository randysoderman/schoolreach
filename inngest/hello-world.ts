import { z } from "zod";
import { inngest } from "./client";

// Event payload shape. Validated explicitly in the function so we surface
// malformed events in the dashboard rather than letting them silently pass.
const HelloEvent = z.object({ name: z.string().min(1).default("world") });

export const helloWorld = inngest.createFunction(
  { id: "hello-world", name: "Hello world" },
  { event: "app/hello.world" },
  async ({ event, step, logger }) => {
    const data = HelloEvent.parse(event.data ?? {});

    const greeting = await step.run("build-greeting", () => {
      return `Hello, ${data.name}!`;
    });

    logger.info("greeted", { name: data.name });
    return { greeting };
  },
);

import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { helloWorld } from "@/inngest/hello-world";
import { discoveryRun } from "@/inngest/discovery";
import { scrapeSchool } from "@/inngest/scrape";
import { emailEnrich } from "@/inngest/email-enrich";

// Inngest discovers and runs registered functions via this route. Add new
// functions to the `functions` array as we build them.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [helloWorld, discoveryRun, scrapeSchool, emailEnrich],
});

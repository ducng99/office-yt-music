import { $ } from "bun";

await $`bunx web-ext sign --api-key ${process.env.AMO_JWT_ID} --api-secret ${process.env.AMO_JWT_SECRET} -s dist --channel unlisted`;

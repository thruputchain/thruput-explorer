import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { hashFromBase58, isThruputError, toBase58 } from "@thruputchain/client";
import { inspectRun, reconcileRun, withLocalScenario } from "@thruputchain/testkit";
import { seedLocalNode } from "./index";

test(
  "seeds a real node and completes when every send response is lost",
  { timeout: 180_000 },
  async (t) => {
    const logs: string[] = [];
    const log = console.log;
    t.mock.method(console, "log", (...args: unknown[]) => {
      logs.push(args.join(" "));
      log(...args);
    });
    const parent = await mkdtemp(join(tmpdir(), "explorer-seed-"));
    try {
      await withLocalScenario(
        { seed: "explorer-seed-qualification", accounts: {} },
        async (node) => {
          const network = toBase58(node.client.network.networkHash);
          // A wrong expected network stops before funding or signing.
          await assert.rejects(
            seedLocalNode(node.local.rpcUrl, toBase58(new Uint8Array(32).fill(9)), parent),
            (error) =>
              isThruputError(error, "rpcIncompatible") && error.context.kind === "network",
          );
          const stoppedRuns = await readdir(parent);
          for (const name of stoppedRuns)
            assert.deepEqual(await readdir(join(parent, name)), []);
          const output = await seedLocalNode(node.local.rpcUrl, network, parent);
          const report = await inspectRun(join(output.directory, "transactions"));
          assert.deepEqual(output.report, report);
          // Disposable local accounts: the run saves its report, not private keys.
          assert.deepEqual(await readdir(output.directory), ["transactions"]);
          assert.equal(Object.keys(report.actors).length, 6);
          assert.equal(report.steps.length, 31); // Includes final balance/supply verification.
          assert.ok(report.steps.every((step) => step.state === "completed"));
          assert.equal(report.steps.at(-1)?.name, "verify-balances");
          assert.equal(report.attempts.length, 30); // Six faucet requests and 24 wallet transactions.
          assert.ok(report.attempts.every((attempt) => attempt.state === "committed"));
          assert.ok(report.attempts.every((attempt) => attempt.outcome === "succeeded"));
          const transcript = logs.join("\n");
          for (const attempt of report.attempts) {
            assert.ok(attempt.transactionHash && transcript.includes(attempt.transactionHash));
            assert.ok(report.actors[attempt.actor]);
          }
          const deployments = report.steps.filter((step) => step.name.startsWith("deploy/"));
          assert.equal(deployments.length, 3);
          for (const step of deployments) {
            assert.equal(typeof step.metadata?.address, "string");
            assert.ok(transcript.includes(`${step.metadata?.symbol}: ${step.metadata?.address}`));
            const attempt = report.attempts.find((attempt) => attempt.step === step.name)!;
            assert.equal((attempt.intent as { address: string }).address, step.metadata?.address);
          }
          // Faucet hashes are in the report, and each has a receipt on the node.
          const funding = report.attempts.filter((attempt) => attempt.operation === "fund");
          assert.equal(funding.length, 6);
          for (const attempt of funding) {
            assert.ok(
              await node.client.getTransactionReceipt({
                transactionHash: hashFromBase58(attempt.transactionHash!),
              }),
            );
          }
          for (const [name, address] of Object.entries(report.actors)) {
            assert.ok(transcript.includes(`${name}: ${address}`));
          }

          // Forward every wallet transaction, then drop its response.
          let sends = 0;
          const proxy = createServer(async (request, response) => {
            try {
              const chunks = [];
              for await (const chunk of request) chunks.push(Buffer.from(chunk));
              const body = Buffer.concat(chunks).toString();
              const upstream = await fetch(node.local.rpcUrl, {
                method: "POST",
                body,
                headers: { "content-type": "application/json" },
              });
              const result = await upstream.text();
              if (JSON.parse(body).method === "sendTransaction") {
                sends++;
                response.destroy();
              } else {
                response.writeHead(upstream.status, { "content-type": "application/json" });
                response.end(result);
              }
            } catch (error) {
              response.destroy(error instanceof Error ? error : undefined);
            }
          });
          await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
          try {
            const address = proxy.address();
            assert.ok(address && typeof address !== "string");
            // The seed observes each signed transaction instead of sending it again.
            await seedLocalNode(`http://127.0.0.1:${address.port}`, network, parent);
            const lostDirectory = (await readdir(parent)).find(
              (name) => !stoppedRuns.includes(name) && join(parent, name) !== output.directory,
            )!;
            const lostPath = join(parent, lostDirectory, "transactions");
            const lost = await inspectRun(lostPath);
            assert.ok(lost.steps.every((step) => step.state === "completed"));
            assert.ok(lost.attempts.every((attempt) => attempt.outcome === "succeeded"));
            // One send per signed transaction; faucet requests are not signed.
            const signed = lost.attempts.filter((attempt) => attempt.operation !== "fund");
            assert.equal(signed.length, 24);
            assert.equal(sends, signed.length);
            const reconciled = await reconcileRun(lostPath, node.client);
            // Faucet hashes and signed transactions are observed; nothing is sent again.
            assert.deepEqual(
              reconciled.observations.map(({ transactionHash, outcome }) => [transactionHash, outcome]),
              lost.attempts.map(({ transactionHash }) => [transactionHash, "succeeded"]),
            );
            assert.deepEqual(await inspectRun(lostPath), lost);
          } finally {
            proxy.closeAllConnections();
            await new Promise<void>((resolve, reject) =>
              proxy.close((error) => (error ? reject(error) : resolve())),
            );
          }
          await node.client.getChainTip(); // Attached seed scenarios leave the external node running.
        },
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  },
);

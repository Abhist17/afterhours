import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Afterhours } from "../target/types/afterhours";
import { expect } from "chai";

const nowSeconds = () => Math.floor(Date.now() / 1000);
let tick = 0;
const uniqueTimestamp = () => new anchor.BN(nowSeconds() + tick++);

const WSOL = new anchor.web3.PublicKey("So11111111111111111111111111111111111111112");
const SPYX = new anchor.web3.PublicKey("XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W");
const TSLAX = new anchor.web3.PublicKey("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
const USDC = new anchor.web3.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

describe("afterhours", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Afterhours as Program<Afterhours>;
  const owner = provider.wallet;

  const policyPda = (who: anchor.web3.PublicKey) =>
    anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("policy"), who.toBuffer()], program.programId)[0];
  const snapshotPda = (who: anchor.web3.PublicKey, t: anchor.BN) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("snapshot"), who.toBuffer(), t.toArrayLike(Buffer, "le", 8)],
      program.programId
    )[0];

  async function fund(key: anchor.web3.PublicKey, sol = 1) {
    const sig = await provider.connection.requestAirdrop(key, sol * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  async function eventsOf(signature: string) {
    const deadline = Date.now() + 10_000;
    let logs: string[] | null | undefined;
    while (Date.now() < deadline) {
      const tx = await provider.connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      logs = tx?.meta?.logMessages;
      if (logs) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(logs, `transaction ${signature} never became readable`).to.exist;
    return Array.from(new anchor.EventParser(program.programId, program.coder).parseLogs(logs!));
  }

  async function waitForDeployment(timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    while (Date.now() < deadline) {
      const info = await provider.connection.getAccountInfo(program.programId);
      if (info?.executable) {
        const deployedAt = await provider.connection.getSlot("confirmed");
        while (Date.now() < deadline) {
          if ((await provider.connection.getSlot("confirmed")) > deployedAt + 1) return;
          await sleep(200);
        }
      }
      await sleep(400);
    }
    throw new Error("program not invokable");
  }

  const TARGETS = [
    { mint: SPYX, weightBps: 6000 },
    { mint: USDC, weightBps: 4000 },
  ];

  before(async () => {
    await waitForDeployment();
  });

  // ------------------------------
  // Policy
  // ------------------------------
  describe("policy", () => {
    it("lets an owner declare targets, a risk limit and a drift band", async () => {
      await program.methods.createPolicy(45, 500, TARGETS).accounts({ owner: owner.publicKey }).rpc();
      const p = await program.account.policy.fetch(policyPda(owner.publicKey));
      expect(p.owner.toBase58()).to.equal(owner.publicKey.toBase58());
      expect(p.riskLimit).to.equal(45);
      expect(p.driftBandBps).to.equal(500);
      expect(p.targets.length).to.equal(2);
      expect(p.targets[0].mint.toBase58()).to.equal(SPYX.toBase58());
      expect(p.targets[0].weightBps).to.equal(6000);
      expect(p.updatedAt.toNumber()).to.be.greaterThan(0);
    });

    it("refuses targets that do not sum to one", async () => {
      const someone = anchor.web3.Keypair.generate();
      await fund(someone.publicKey);
      try {
        await program.methods
          .createPolicy(45, 500, [{ mint: SPYX, weightBps: 6000 }, { mint: USDC, weightBps: 3000 }])
          .accounts({ owner: someone.publicKey })
          .signers([someone])
          .rpc();
        expect.fail("should have refused");
      } catch (err: any) {
        expect(err.error?.errorCode?.code ?? String(err)).to.contain("TargetsMustSumToOne");
      }
    });

    it("refuses a duplicated mint, an empty list, and out-of-range limits", async () => {
      const someone = anchor.web3.Keypair.generate();
      await fund(someone.publicKey);
      const attempt = async (limit: number, band: number, targets: typeof TARGETS) => {
        try {
          await program.methods.createPolicy(limit, band, targets).accounts({ owner: someone.publicKey }).signers([someone]).rpc();
          return "ok";
        } catch (err: any) {
          return err.error?.errorCode?.code ?? String(err);
        }
      };
      expect(await attempt(45, 500, [{ mint: SPYX, weightBps: 5000 }, { mint: SPYX, weightBps: 5000 }])).to.contain("DuplicateTarget");
      expect(await attempt(45, 500, [])).to.contain("TooManyTargets");
      expect(await attempt(101, 500, TARGETS)).to.contain("InvalidScore");
      expect(await attempt(45, 10_001, TARGETS)).to.contain("InvalidShare");
    });

    it("lets the owner update and blocks everyone else", async () => {
      await program.methods
        .updatePolicy(50, 1000, [{ mint: SPYX, weightBps: 5000 }, { mint: TSLAX, weightBps: 2000 }, { mint: WSOL, weightBps: 3000 }])
        .accounts({ owner: owner.publicKey })
        .rpc();
      const p = await program.account.policy.fetch(policyPda(owner.publicKey));
      expect(p.riskLimit).to.equal(50);
      expect(p.targets.length).to.equal(3);

      const attacker = anchor.web3.Keypair.generate();
      await fund(attacker.publicKey);
      try {
        await program.methods
          .updatePolicy(1, 1, TARGETS)
          .accountsPartial({ policy: policyPda(owner.publicKey), owner: attacker.publicKey })
          .signers([attacker])
          .rpc();
        expect.fail("a stranger edited the policy");
      } catch (err) {
        expect(err).to.exist;
      }
      const again = await program.account.policy.fetch(policyPda(owner.publicKey));
      expect(again.riskLimit).to.equal(50);
    });
  });

  // ------------------------------
  // Snapshots
  // ------------------------------
  describe("snapshots", () => {
    it("records a reading and reports it against the policy", async () => {
      const t = uniqueTimestamp();
      const sig = await program.methods
        .recordSnapshot(t, 38, new anchor.BN(2_898_500), new anchor.BN(97_180), 250, 7300, false)
        .accounts({ owner: owner.publicKey })
        .rpc();

      const s = await program.account.snapshot.fetch(snapshotPda(owner.publicKey, t));
      expect(s.score).to.equal(38);
      expect(s.valueUsdCents.toNumber()).to.equal(2_898_500);
      expect(s.varUsdCents.toNumber()).to.equal(97_180);
      expect(s.driftBps).to.equal(250);
      expect(s.equityBps).to.equal(7300);
      expect(s.marketOpen).to.equal(false);

      const [event] = await eventsOf(sig);
      expect(event.name).to.equal("snapshotRecorded");
      expect(event.data.riskLimit).to.equal(50);
      expect(event.data.driftBandBps).to.equal(1000);
      expect(event.data.breached).to.equal(false);
    });

    it("flags a breach of either limit", async () => {
      const t1 = uniqueTimestamp();
      const sig1 = await program.methods
        .recordSnapshot(t1, 51, new anchor.BN(1), new anchor.BN(1), 0, 0, true)
        .accounts({ owner: owner.publicKey })
        .rpc();
      expect((await eventsOf(sig1))[0].data.breached).to.equal(true);

      const t2 = uniqueTimestamp();
      const sig2 = await program.methods
        .recordSnapshot(t2, 10, new anchor.BN(1), new anchor.BN(1), 1001, 0, true)
        .accounts({ owner: owner.publicKey })
        .rpc();
      expect((await eventsOf(sig2))[0].data.breached).to.equal(true);
    });

    it("records without a policy, and the event says so", async () => {
      const lone = anchor.web3.Keypair.generate();
      await fund(lone.publicKey);
      const t = uniqueTimestamp();
      const sig = await program.methods
        .recordSnapshot(t, 70, new anchor.BN(500_000), new anchor.BN(30_000), 0, 10_000, true)
        .accountsPartial({ policy: null, owner: lone.publicKey })
        .signers([lone])
        .rpc();
      const [event] = await eventsOf(sig);
      expect(event.data.riskLimit).to.equal(null);
      expect(event.data.breached).to.equal(false);
    });

    it("refuses a score above 100, a share above one, and a stale timestamp", async () => {
      const attempt = async (t: anchor.BN, score: number, equity: number) => {
        try {
          await program.methods.recordSnapshot(t, score, new anchor.BN(1), new anchor.BN(1), 0, equity, true).accounts({ owner: owner.publicKey }).rpc();
          return "ok";
        } catch (err: any) {
          return err.error?.errorCode?.code ?? String(err);
        }
      };
      expect(await attempt(uniqueTimestamp(), 101, 0)).to.contain("InvalidScore");
      expect(await attempt(uniqueTimestamp(), 10, 10_001)).to.contain("InvalidShare");
      expect(await attempt(new anchor.BN(nowSeconds() - 86_400), 10, 0)).to.contain("TimestampOutOfRange");
    });

    it("is immutable once written", async () => {
      const t = uniqueTimestamp();
      await program.methods.recordSnapshot(t, 20, new anchor.BN(1), new anchor.BN(1), 0, 0, true).accounts({ owner: owner.publicKey }).rpc();
      try {
        await program.methods.recordSnapshot(t, 80, new anchor.BN(1), new anchor.BN(1), 0, 0, true).accounts({ owner: owner.publicKey }).rpc();
        expect.fail("overwrote a snapshot");
      } catch (err) {
        expect(err).to.exist;
      }
      expect((await program.account.snapshot.fetch(snapshotPda(owner.publicKey, t))).score).to.equal(20);
    });

    it("lists an owner's snapshots by memcmp on the owner field", async () => {
      const mine = await program.account.snapshot.all([{ memcmp: { offset: 8, bytes: owner.publicKey.toBase58() } }]);
      expect(mine.length).to.be.greaterThan(2);
      for (const { account } of mine) expect(account.owner.toBase58()).to.equal(owner.publicKey.toBase58());
    });
  });

  // ------------------------------
  // Rent
  // ------------------------------
  describe("close", () => {
    it("returns a snapshot's rent to its owner and to nobody else", async () => {
      const t = uniqueTimestamp();
      const pda = snapshotPda(owner.publicKey, t);
      await program.methods.recordSnapshot(t, 20, new anchor.BN(1), new anchor.BN(1), 0, 0, true).accounts({ owner: owner.publicKey }).rpc();

      const attacker = anchor.web3.Keypair.generate();
      await fund(attacker.publicKey);
      try {
        await program.methods.closeSnapshot().accountsPartial({ snapshot: pda, owner: attacker.publicKey }).signers([attacker]).rpc();
        expect.fail("a stranger closed the snapshot");
      } catch (err) {
        expect(err).to.exist;
      }

      const before = await provider.connection.getBalance(owner.publicKey);
      await program.methods.closeSnapshot().accountsPartial({ snapshot: pda, owner: owner.publicKey }).rpc();
      expect(await provider.connection.getAccountInfo(pda)).to.equal(null);
      expect(await provider.connection.getBalance(owner.publicKey)).to.be.greaterThan(before);
    });

    it("returns the policy's rent to its owner", async () => {
      const leaver = anchor.web3.Keypair.generate();
      await fund(leaver.publicKey);
      await program.methods.createPolicy(30, 300, TARGETS).accounts({ owner: leaver.publicKey }).signers([leaver]).rpc();
      const pda = policyPda(leaver.publicKey);
      expect(await provider.connection.getBalance(pda)).to.be.greaterThan(0);
      await program.methods.closePolicy().accounts({ owner: leaver.publicKey }).signers([leaver]).rpc();
      expect(await provider.connection.getAccountInfo(pda)).to.equal(null);
    });
  });
});

//! Afterhours — on-chain policy and risk snapshots for tokenized stock
//! portfolios on Solana.
//!
//! Two account types, both owned by the wallet they describe:
//!
//!   POLICY — what the owner meant their book to be: target weights per
//!   mint, a risk limit, and how far the book may drift before that counts
//!   as a breach. Stated once, on-chain, so that "drift" is measured against
//!   a declared intent rather than a guess, and so anything else on Solana —
//!   a vault, a lending market, a rebalancing bot — can read it.
//!
//!   SNAPSHOT — one immutable reading of the book: score, value, Value at
//!   Risk, drift from policy, share in tokenized stocks, and whether the
//!   stock market was open when it was taken. Signed by the owner, so the
//!   record is theirs and nobody can write one on their behalf.
//!
//! A snapshot recorded while a policy exists emits an event that says
//! whether either limit was breached. That event is the primitive a credit
//! protocol lending against a stock portfolio would subscribe to.

use anchor_lang::prelude::*;

declare_id!("3hqhzG55EkCjhUYmmCxHWyNGkXi3XJSTEWimkTzVifri");

/// A snapshot's timestamp is chosen by the client so its address can be
/// derived before the write; it is checked against the cluster clock so
/// nobody can backfill a flattering history.
pub const MAX_CLOCK_DRIFT_SECONDS: i64 = 15 * 60;

pub const MAX_SCORE: u8 = 100;
pub const MAX_TARGETS: usize = 12;
pub const BPS: u16 = 10_000;

#[program]
pub mod afterhours {
    use super::*;

    /// Declares the owner's policy. Target weights are in basis points and
    /// must sum to exactly 10,000 — a policy that does not add up is not a
    /// policy. Native SOL is identified by the wrapped-SOL mint.
    pub fn create_policy(
        ctx: Context<CreatePolicy>,
        risk_limit: u8,
        drift_band_bps: u16,
        targets: Vec<Target>,
    ) -> Result<()> {
        validate_policy(risk_limit, drift_band_bps, &targets)?;

        let policy = &mut ctx.accounts.policy;
        policy.owner = ctx.accounts.owner.key();
        policy.risk_limit = risk_limit;
        policy.drift_band_bps = drift_band_bps;
        policy.targets = targets;
        policy.updated_at = Clock::get()?.unix_timestamp;
        policy.bump = ctx.bumps.policy;
        Ok(())
    }

    pub fn update_policy(
        ctx: Context<UpdatePolicy>,
        risk_limit: u8,
        drift_band_bps: u16,
        targets: Vec<Target>,
    ) -> Result<()> {
        validate_policy(risk_limit, drift_band_bps, &targets)?;

        let policy = &mut ctx.accounts.policy;
        policy.risk_limit = risk_limit;
        policy.drift_band_bps = drift_band_bps;
        policy.targets = targets;
        policy.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Closes the policy and returns its rent to the owner.
    pub fn close_policy(_ctx: Context<ClosePolicy>) -> Result<()> {
        Ok(())
    }

    /// Records one reading of the book. When the owner has a policy it is
    /// passed in read-only and the event says whether the reading breaches
    /// it; without one the snapshot still lands, and the event still fires.
    #[allow(clippy::too_many_arguments)]
    pub fn record_snapshot(
        ctx: Context<RecordSnapshot>,
        timestamp: i64,
        score: u8,
        value_usd_cents: u64,
        var_usd_cents: u64,
        drift_bps: u16,
        equity_bps: u16,
        market_open: bool,
    ) -> Result<()> {
        require!(score <= MAX_SCORE, AfterhoursError::InvalidScore);
        require!(equity_bps <= BPS, AfterhoursError::InvalidShare);

        let now = Clock::get()?.unix_timestamp;
        require!(
            (timestamp - now).abs() <= MAX_CLOCK_DRIFT_SECONDS,
            AfterhoursError::TimestampOutOfRange
        );

        let owner = ctx.accounts.owner.key();
        let snapshot = &mut ctx.accounts.snapshot;
        snapshot.owner = owner;
        snapshot.timestamp = timestamp;
        snapshot.score = score;
        snapshot.value_usd_cents = value_usd_cents;
        snapshot.var_usd_cents = var_usd_cents;
        snapshot.drift_bps = drift_bps;
        snapshot.equity_bps = equity_bps;
        snapshot.market_open = market_open;
        snapshot.bump = ctx.bumps.snapshot;

        let (risk_limit, drift_band_bps, breached) = match ctx.accounts.policy.as_ref() {
            Some(policy) => (
                Some(policy.risk_limit),
                Some(policy.drift_band_bps),
                score > policy.risk_limit || drift_bps > policy.drift_band_bps,
            ),
            None => (None, None, false),
        };

        emit!(SnapshotRecorded {
            owner,
            timestamp,
            score,
            value_usd_cents,
            var_usd_cents,
            drift_bps,
            equity_bps,
            market_open,
            risk_limit,
            drift_band_bps,
            breached,
        });

        Ok(())
    }

    /// Closes a snapshot and returns its rent to the owner.
    pub fn close_snapshot(_ctx: Context<CloseSnapshot>) -> Result<()> {
        Ok(())
    }
}

fn validate_policy(risk_limit: u8, drift_band_bps: u16, targets: &[Target]) -> Result<()> {
    require!(risk_limit <= MAX_SCORE, AfterhoursError::InvalidScore);
    require!(drift_band_bps <= BPS, AfterhoursError::InvalidShare);
    require!(
        !targets.is_empty() && targets.len() <= MAX_TARGETS,
        AfterhoursError::TooManyTargets
    );

    let mut sum: u32 = 0;
    for (i, target) in targets.iter().enumerate() {
        sum += target.weight_bps as u32;
        // Two lines for one mint would make the drift arithmetic ambiguous.
        for other in &targets[..i] {
            require!(other.mint != target.mint, AfterhoursError::DuplicateTarget);
        }
    }
    require!(sum == BPS as u32, AfterhoursError::TargetsMustSumToOne);
    Ok(())
}

//
// ----------------------------
// Accounts
// ----------------------------
//

#[derive(Accounts)]
pub struct CreatePolicy<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Policy::INIT_SPACE,
        seeds = [Policy::SEED, owner.key().as_ref()],
        bump
    )]
    pub policy: Account<'info, Policy>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePolicy<'info> {
    // Seeded by the signer: a non-owner cannot even produce the address.
    #[account(
        mut,
        seeds = [Policy::SEED, owner.key().as_ref()],
        bump = policy.bump,
    )]
    pub policy: Account<'info, Policy>,

    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClosePolicy<'info> {
    #[account(
        mut,
        close = owner,
        seeds = [Policy::SEED, owner.key().as_ref()],
        bump = policy.bump,
    )]
    pub policy: Account<'info, Policy>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(timestamp: i64)]
pub struct RecordSnapshot<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Snapshot::INIT_SPACE,
        seeds = [Snapshot::SEED, owner.key().as_ref(), &timestamp.to_le_bytes()],
        bump
    )]
    pub snapshot: Account<'info, Snapshot>,

    // The owner's policy, if they have declared one. Read-only here: a
    // snapshot reports against the policy, it never edits it.
    #[account(
        seeds = [Policy::SEED, owner.key().as_ref()],
        bump = policy.bump,
    )]
    pub policy: Option<Account<'info, Policy>>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseSnapshot<'info> {
    #[account(
        mut,
        close = owner,
        seeds = [Snapshot::SEED, owner.key().as_ref(), &snapshot.timestamp.to_le_bytes()],
        bump = snapshot.bump,
    )]
    pub snapshot: Account<'info, Snapshot>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

//
// ----------------------------
// Data
// ----------------------------
//

/// One line of a target allocation.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub struct Target {
    /// The token mint; wrapped SOL's mint stands for native SOL.
    pub mint: Pubkey,
    /// Share of the book, in basis points.
    pub weight_bps: u16,
}

/// What the owner meant their book to be.
#[account]
#[derive(InitSpace)]
pub struct Policy {
    pub owner: Pubkey,
    /// Score at or above which a snapshot counts as a breach (exclusive:
    /// breached when score > limit).
    pub risk_limit: u8,
    /// Largest drift from any target that is still acceptable.
    pub drift_band_bps: u16,
    #[max_len(MAX_TARGETS)]
    pub targets: Vec<Target>,
    pub updated_at: i64,
    pub bump: u8,
}

impl Policy {
    pub const SEED: &'static [u8] = b"policy";
}

/// One immutable reading of the book, signed by its owner.
#[account]
#[derive(InitSpace)]
pub struct Snapshot {
    pub owner: Pubkey,
    pub timestamp: i64,
    pub score: u8,
    pub value_usd_cents: u64,
    pub var_usd_cents: u64,
    /// Largest drift from any policy target at the time, in basis points.
    pub drift_bps: u16,
    /// Share of the book in tokenized stocks, in basis points.
    pub equity_bps: u16,
    /// Whether the NYSE was open — whether the stocks behind the tokens
    /// were trading — when this was taken.
    pub market_open: bool,
    pub bump: u8,
}

impl Snapshot {
    pub const SEED: &'static [u8] = b"snapshot";
}

//
// ----------------------------
// Events and errors
// ----------------------------
//

#[event]
pub struct SnapshotRecorded {
    pub owner: Pubkey,
    pub timestamp: i64,
    pub score: u8,
    pub value_usd_cents: u64,
    pub var_usd_cents: u64,
    pub drift_bps: u16,
    pub equity_bps: u16,
    pub market_open: bool,
    /// The policy's limits when one exists; absent otherwise, and then
    /// `breached` is false.
    pub risk_limit: Option<u8>,
    pub drift_band_bps: Option<u16>,
    pub breached: bool,
}

#[error_code]
pub enum AfterhoursError {
    #[msg("Score and risk limit must be between 0 and 100")]
    InvalidScore,

    #[msg("A share in basis points cannot exceed 10,000")]
    InvalidShare,

    #[msg("A policy needs between 1 and 12 targets")]
    TooManyTargets,

    #[msg("Target weights must sum to exactly 10,000 basis points")]
    TargetsMustSumToOne,

    #[msg("A mint appears twice in the targets")]
    DuplicateTarget,

    #[msg("Timestamp is too far from the cluster clock")]
    TimestampOutOfRange,
}

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, BytesN, Env, Vec,
};

const DAY: u64 = 86_400;
const REVIEW_PERIOD: u64 = 2 * DAY;
const MAX_AMOUNT: i128 = 1_000_000_000_000_000_000;
const MAX_PARTICIPANTS: u32 = 32;
const TTL_THRESHOLD: u32 = 120_960;
const TTL_EXTEND: u32 = 1_555_200;

#[contracttype]
#[derive(Clone)]
enum Key {
    Token,
    Resolver,
    Booking(BytesN<32>),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum State {
    Proposed,
    Funding,
    Funded,
    Submitted,
    Disputed,
    Paid,
    Refundable,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Share {
    pub wallet: Address,
    pub amount: i128,
    pub paid: bool,
    pub refunded: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Booking {
    pub organizer: Address,
    pub provider: Address,
    pub participants: Vec<Share>,
    pub total: i128,
    pub funded: i128,
    pub funding_deadline: u64,
    pub work_deadline: u64,
    pub review_deadline: u64,
    pub refund_pool: i128,
    pub state: State,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    Missing = 1,
    Exists = 2,
    InvalidTerms = 3,
    InvalidState = 4,
    DeadlinePassed = 5,
    Unauthorized = 6,
    AlreadyContributed = 7,
    NothingToRefund = 8,
    TooEarly = 9,
}

#[contractevent]
#[derive(Clone)]
pub struct Changed {
    #[topic]
    pub booking: BytesN<32>,
    pub state: State,
    pub funded: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct Contribution {
    #[topic]
    pub booking: BytesN<32>,
    pub wallet: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct Refunded {
    #[topic]
    pub booking: BytesN<32>,
    pub wallet: Address,
    pub amount: i128,
}

#[contract]
pub struct CampusCrewEscrow;

fn save(env: &Env, id: &BytesN<32>, booking: &Booking) {
    let key = Key::Booking(id.clone());
    env.storage().persistent().set(&key, booking);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    Changed {
        booking: id.clone(),
        state: booking.state.clone(),
        funded: booking.funded,
    }
    .publish(env);
}

fn load(env: &Env, id: &BytesN<32>) -> Booking {
    env.storage()
        .persistent()
        .get(&Key::Booking(id.clone()))
        .unwrap_or_else(|| panic_with_error!(env, Error::Missing))
}

fn transfer(env: &Env, from: &Address, to: &Address, amount: i128) {
    if amount > 0 {
        let asset: Address = env.storage().instance().get(&Key::Token).unwrap();
        token::Client::new(env, &asset).transfer(from, to, &amount);
    }
}

fn is_participant(booking: &Booking, wallet: &Address) -> bool {
    booking
        .participants
        .iter()
        .any(|share| share.wallet == *wallet)
}

fn payout(env: &Env, id: &BytesN<32>, mut booking: Booking, provider_amount: i128) {
    booking.refund_pool = booking.funded - provider_amount;
    booking.state = if booking.refund_pool > 0 {
        State::Refundable
    } else {
        State::Paid
    };
    save(env, id, &booking);
    transfer(
        env,
        &env.current_contract_address(),
        &booking.provider,
        provider_amount,
    );
}

#[contractimpl]
impl CampusCrewEscrow {
    pub fn __constructor(env: Env, token: Address, resolver: Address) {
        env.storage().instance().set(&Key::Token, &token);
        env.storage().instance().set(&Key::Resolver, &resolver);
    }

    pub fn token(env: Env) -> Address {
        env.storage().instance().get(&Key::Token).unwrap()
    }

    pub fn resolver(env: Env) -> Address {
        env.storage().instance().get(&Key::Resolver).unwrap()
    }

    pub fn create(
        env: Env,
        id: BytesN<32>,
        organizer: Address,
        provider: Address,
        contributions: Vec<(Address, i128)>,
        funding_deadline: u64,
        work_deadline: u64,
    ) {
        organizer.require_auth();
        if env.storage().persistent().has(&Key::Booking(id.clone())) {
            panic_with_error!(&env, Error::Exists);
        }
        let now = env.ledger().timestamp();
        let resolver = Self::resolver(env.clone());
        if organizer == provider
            || resolver == provider
            || resolver == organizer
            || contributions.is_empty()
            || contributions.len() > MAX_PARTICIPANTS
            || funding_deadline <= now
            || funding_deadline > now + 7 * DAY
            || work_deadline <= funding_deadline
            || work_deadline > now + 30 * DAY
        {
            panic_with_error!(&env, Error::InvalidTerms);
        }
        let mut participants = Vec::new(&env);
        let mut total = 0_i128;
        for (wallet, amount) in contributions.iter() {
            if wallet == provider
                || wallet == resolver
                || amount <= 0
                || amount > MAX_AMOUNT
                || participants
                    .iter()
                    .any(|share: Share| share.wallet == wallet)
            {
                panic_with_error!(&env, Error::InvalidTerms);
            }
            total += amount;
            if total > MAX_AMOUNT {
                panic_with_error!(&env, Error::InvalidTerms);
            }
            participants.push_back(Share {
                wallet,
                amount,
                paid: false,
                refunded: false,
            });
        }
        let booking = Booking {
            organizer: organizer.clone(),
            provider,
            participants,
            total,
            funded: 0,
            funding_deadline,
            work_deadline,
            review_deadline: 0,
            refund_pool: 0,
            state: State::Proposed,
        };
        if !is_participant(&booking, &organizer) {
            panic_with_error!(&env, Error::InvalidTerms);
        }
        save(&env, &id, &booking);
    }

    pub fn accept(env: Env, id: BytesN<32>) {
        let mut booking = load(&env, &id);
        booking.provider.require_auth();
        if booking.state != State::Proposed {
            panic_with_error!(&env, Error::InvalidState);
        }
        if env.ledger().timestamp() >= booking.funding_deadline {
            panic_with_error!(&env, Error::DeadlinePassed);
        }
        booking.state = State::Funding;
        save(&env, &id, &booking);
    }

    pub fn contribute(env: Env, id: BytesN<32>, wallet: Address) {
        wallet.require_auth();
        let mut booking = load(&env, &id);
        if booking.state != State::Funding {
            panic_with_error!(&env, Error::InvalidState);
        }
        if env.ledger().timestamp() >= booking.funding_deadline {
            panic_with_error!(&env, Error::DeadlinePassed);
        }
        let index = booking
            .participants
            .iter()
            .position(|share| share.wallet == wallet)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized))
            as u32;
        let mut share = booking.participants.get(index).unwrap();
        if share.paid {
            panic_with_error!(&env, Error::AlreadyContributed);
        }
        share.paid = true;
        booking.funded += share.amount;
        booking.participants.set(index, share.clone());
        if booking.funded == booking.total {
            booking.state = State::Funded;
        }
        save(&env, &id, &booking);
        transfer(&env, &wallet, &env.current_contract_address(), share.amount);
        Contribution {
            booking: id,
            wallet,
            amount: share.amount,
        }
        .publish(&env);
    }

    pub fn submit(env: Env, id: BytesN<32>) {
        let mut booking = load(&env, &id);
        booking.provider.require_auth();
        if booking.state != State::Funded {
            panic_with_error!(&env, Error::InvalidState);
        }
        if env.ledger().timestamp() >= booking.work_deadline {
            panic_with_error!(&env, Error::DeadlinePassed);
        }
        booking.state = State::Submitted;
        booking.review_deadline = env.ledger().timestamp() + REVIEW_PERIOD;
        save(&env, &id, &booking);
    }

    pub fn release(env: Env, id: BytesN<32>) {
        let booking = load(&env, &id);
        booking.organizer.require_auth();
        if booking.state != State::Submitted {
            panic_with_error!(&env, Error::InvalidState);
        }
        let amount = booking.total;
        payout(&env, &id, booking, amount);
    }

    pub fn claim_payout(env: Env, id: BytesN<32>) {
        let booking = load(&env, &id);
        booking.provider.require_auth();
        if booking.state != State::Submitted {
            panic_with_error!(&env, Error::InvalidState);
        }
        if env.ledger().timestamp() < booking.review_deadline {
            panic_with_error!(&env, Error::TooEarly);
        }
        let amount = booking.total;
        payout(&env, &id, booking, amount);
    }

    pub fn dispute(env: Env, id: BytesN<32>, actor: Address) {
        actor.require_auth();
        let mut booking = load(&env, &id);
        if booking.provider != actor && !is_participant(&booking, &actor) {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if booking.state != State::Funded && booking.state != State::Submitted {
            panic_with_error!(&env, Error::InvalidState);
        }
        booking.state = State::Disputed;
        save(&env, &id, &booking);
    }

    pub fn resolve(env: Env, id: BytesN<32>, provider_amount: i128) {
        Self::resolver(env.clone()).require_auth();
        let booking = load(&env, &id);
        if booking.state != State::Disputed {
            panic_with_error!(&env, Error::InvalidState);
        }
        if provider_amount < 0 || provider_amount > booking.funded {
            panic_with_error!(&env, Error::InvalidTerms);
        }
        payout(&env, &id, booking, provider_amount);
    }

    pub fn cancel(env: Env, id: BytesN<32>, actor: Address) {
        actor.require_auth();
        let mut booking = load(&env, &id);
        if booking.organizer != actor && booking.provider != actor {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if booking.state != State::Proposed && booking.state != State::Funding {
            panic_with_error!(&env, Error::InvalidState);
        }
        booking.refund_pool = booking.funded;
        booking.state = State::Refundable;
        save(&env, &id, &booking);
    }

    pub fn refund(env: Env, id: BytesN<32>, wallet: Address) -> i128 {
        wallet.require_auth();
        let mut booking = load(&env, &id);
        if booking.state == State::Proposed || booking.state == State::Funding {
            if env.ledger().timestamp() < booking.funding_deadline {
                panic_with_error!(&env, Error::TooEarly);
            }
            booking.state = State::Refundable;
            booking.refund_pool = booking.funded;
        }
        if booking.state != State::Refundable {
            panic_with_error!(&env, Error::InvalidState);
        }
        let mut cumulative = 0_i128;
        for index in 0..booking.participants.len() {
            let mut share = booking.participants.get(index).unwrap();
            let before = cumulative;
            if share.paid {
                cumulative += share.amount;
            }
            if share.wallet != wallet {
                continue;
            }
            if !share.paid || share.refunded {
                panic_with_error!(&env, Error::NothingToRefund);
            }
            // Cumulative allocation preserves every atomic unit, including split-payment rounding.
            let amount = booking.refund_pool * cumulative / booking.funded
                - booking.refund_pool * before / booking.funded;
            share.refunded = true;
            booking.participants.set(index, share);
            save(&env, &id, &booking);
            transfer(&env, &env.current_contract_address(), &wallet, amount);
            Refunded {
                booking: id,
                wallet,
                amount,
            }
            .publish(&env);
            return amount;
        }
        panic_with_error!(&env, Error::Unauthorized);
    }

    pub fn get_booking(env: Env, id: BytesN<32>) -> Booking {
        let booking = load(&env, &id);
        let key = Key::Booking(id);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        booking
    }
}

#[cfg(test)]
mod test;

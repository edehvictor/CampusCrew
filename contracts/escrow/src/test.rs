use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    vec,
};

struct Fixture {
    env: Env,
    contract: Address,
    token: Address,
    organizer: Address,
    provider: Address,
    resolver: Address,
    id: BytesN<32>,
}

impl Fixture {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000);
        let organizer = Address::generate(&env);
        let provider = Address::generate(&env);
        let resolver = Address::generate(&env);
        let asset = env.register_stellar_asset_contract_v2(Address::generate(&env));
        let token = asset.address();
        let contract = env.register(CampusCrewEscrow, (token.clone(), resolver.clone()));
        Self {
            id: BytesN::from_array(&env, &[1; 32]),
            env,
            contract,
            token,
            organizer,
            provider,
            resolver,
        }
    }

    fn client(&self) -> CampusCrewEscrowClient<'_> {
        CampusCrewEscrowClient::new(&self.env, &self.contract)
    }

    fn balance(&self, wallet: &Address) -> i128 {
        token::Client::new(&self.env, &self.token).balance(wallet)
    }

    fn create(&self, plan: &Vec<(Address, i128)>) {
        for (wallet, amount) in plan.iter() {
            token::StellarAssetClient::new(&self.env, &self.token).mint(&wallet, &amount);
        }
        self.client().create(
            &self.id,
            &self.organizer,
            &self.provider,
            plan,
            &2_000,
            &10_000,
        );
    }

    fn individual(&self) {
        self.create(&vec![&self.env, (self.organizer.clone(), 100)]);
    }

    fn group(&self) -> Vec<(Address, i128)> {
        let plan = vec![
            &self.env,
            (self.organizer.clone(), 40),
            (Address::generate(&self.env), 30),
            (Address::generate(&self.env), 20),
            (Address::generate(&self.env), 10),
        ];
        self.create(&plan);
        plan
    }

    fn fund(&self, plan: &Vec<(Address, i128)>) {
        self.client().accept(&self.id);
        for (wallet, _) in plan.iter() {
            self.client().contribute(&self.id, &wallet);
        }
    }
}

#[test]
fn individual_booking_pays_once_after_provider_submission() {
    let f = Fixture::new();
    f.individual();
    assert_eq!(f.client().get_booking(&f.id).state, State::Proposed);
    f.client().accept(&f.id);
    f.client().contribute(&f.id, &f.organizer);
    assert_eq!(f.balance(&f.contract), 100);
    assert_eq!(f.balance(&f.organizer), 0);
    assert_eq!(f.client().try_release(&f.id), Err(Ok(Error::InvalidState)));
    f.client().submit(&f.id);
    f.client().release(&f.id);
    assert_eq!(f.balance(&f.provider), 100);
    assert_eq!(f.balance(&f.contract), 0);
    assert_eq!(f.client().get_booking(&f.id).state, State::Paid);
    assert_eq!(f.client().try_release(&f.id), Err(Ok(Error::InvalidState)));
    assert_eq!(
        f.client().try_claim_payout(&f.id),
        Err(Ok(Error::InvalidState))
    );
}

#[test]
fn four_contributors_fund_one_booking_and_one_provider_payout() {
    let f = Fixture::new();
    let plan = f.group();
    f.client().accept(&f.id);
    for index in 0..3 {
        f.client().contribute(&f.id, &plan.get(index).unwrap().0);
        assert_eq!(f.client().get_booking(&f.id).state, State::Funding);
        assert_eq!(f.client().try_submit(&f.id), Err(Ok(Error::InvalidState)));
    }
    f.client().contribute(&f.id, &plan.get(3).unwrap().0);
    assert_eq!(f.client().get_booking(&f.id).state, State::Funded);
    f.client().submit(&f.id);
    f.client().release(&f.id);
    assert_eq!(f.balance(&f.provider), 100);
    assert_eq!(f.balance(&f.contract), 0);
    for (wallet, _) in plan.iter() {
        assert_eq!(f.balance(&wallet), 0);
    }
}

#[test]
fn incomplete_group_refunds_each_actual_contributor_at_expiry() {
    let f = Fixture::new();
    let plan = f.group();
    let second = plan.get(1).unwrap().0;
    let third = plan.get(2).unwrap().0;
    f.client().accept(&f.id);
    f.client().contribute(&f.id, &f.organizer);
    f.client().contribute(&f.id, &third);
    assert_eq!(
        f.client().try_refund(&f.id, &third),
        Err(Ok(Error::TooEarly))
    );
    f.env.ledger().set_timestamp(2_000);
    assert_eq!(
        f.client().try_contribute(&f.id, &second),
        Err(Ok(Error::DeadlinePassed))
    );
    assert_eq!(f.client().refund(&f.id, &third), 20);
    assert_eq!(
        f.client().try_refund(&f.id, &second),
        Err(Ok(Error::NothingToRefund))
    );
    assert_eq!(f.client().refund(&f.id, &f.organizer), 40);
    assert_eq!(f.balance(&f.contract), 0);
    assert_eq!(f.balance(&f.organizer), 40);
    assert_eq!(f.balance(&third), 20);
    assert_eq!(
        f.client().try_refund(&f.id, &third),
        Err(Ok(Error::NothingToRefund))
    );
}

#[test]
fn requires_provider_acceptance_and_rejects_duplicate_contribution() {
    let f = Fixture::new();
    let plan = f.group();
    assert_eq!(
        f.client().try_contribute(&f.id, &f.organizer),
        Err(Ok(Error::InvalidState))
    );
    f.client().accept(&f.id);
    assert_eq!(f.client().try_accept(&f.id), Err(Ok(Error::InvalidState)));
    f.client().contribute(&f.id, &f.organizer);
    assert_eq!(
        f.client().try_contribute(&f.id, &f.organizer),
        Err(Ok(Error::AlreadyContributed))
    );
    assert_eq!(f.balance(&f.contract), plan.get(0).unwrap().1);
}

#[test]
fn outsiders_cannot_contribute_cancel_dispute_or_take_refunds() {
    let f = Fixture::new();
    f.individual();
    let outsider = Address::generate(&f.env);
    f.client().accept(&f.id);
    assert_eq!(
        f.client().try_contribute(&f.id, &outsider),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(
        f.client().try_cancel(&f.id, &outsider),
        Err(Ok(Error::Unauthorized))
    );
    f.client().contribute(&f.id, &f.organizer);
    assert_eq!(
        f.client().try_dispute(&f.id, &outsider),
        Err(Ok(Error::Unauthorized))
    );
    f.client().dispute(&f.id, &f.organizer);
    f.client().resolve(&f.id, &0);
    assert_eq!(
        f.client().try_refund(&f.id, &outsider),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(f.client().refund(&f.id, &f.organizer), 100);
}

#[test]
fn dispute_stops_payout_and_split_refunds_preserve_rounding() {
    let f = Fixture::new();
    let plan = f.group();
    f.fund(&plan);
    f.client().submit(&f.id);
    f.client().dispute(&f.id, &plan.get(2).unwrap().0);
    assert_eq!(f.client().try_release(&f.id), Err(Ok(Error::InvalidState)));
    assert_eq!(
        f.client().try_claim_payout(&f.id),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(
        f.client().try_resolve(&f.id, &101),
        Err(Ok(Error::InvalidTerms))
    );
    assert_eq!(
        f.client().try_resolve(&f.id, &-1),
        Err(Ok(Error::InvalidTerms))
    );
    f.client().resolve(&f.id, &37);
    assert_eq!(f.balance(&f.provider), 37);
    assert_eq!(
        f.client().try_resolve(&f.id, &0),
        Err(Ok(Error::InvalidState))
    );
    let mut returned = 0;
    for index in (0..4).rev() {
        returned += f.client().refund(&f.id, &plan.get(index).unwrap().0);
    }
    assert_eq!(returned, 63);
    assert_eq!(f.balance(&f.contract), 0);
}

#[test]
fn resolver_can_authorize_full_payout() {
    let f = Fixture::new();
    f.individual();
    f.fund(&vec![&f.env, (f.organizer.clone(), 100)]);
    f.client().dispute(&f.id, &f.provider);
    f.client().resolve(&f.id, &100);
    assert_eq!(f.balance(&f.provider), 100);
    assert_eq!(f.client().get_booking(&f.id).state, State::Paid);
    assert_eq!(
        f.client().try_refund(&f.id, &f.organizer),
        Err(Ok(Error::InvalidState))
    );
}

#[test]
fn provider_can_claim_only_after_two_day_review_period() {
    let f = Fixture::new();
    f.individual();
    f.fund(&vec![&f.env, (f.organizer.clone(), 100)]);
    f.client().submit(&f.id);
    assert_eq!(f.client().try_submit(&f.id), Err(Ok(Error::InvalidState)));
    assert_eq!(f.client().try_claim_payout(&f.id), Err(Ok(Error::TooEarly)));
    f.env.ledger().set_timestamp(1_000 + REVIEW_PERIOD);
    f.client().claim_payout(&f.id);
    assert_eq!(f.balance(&f.provider), 100);
}

#[test]
fn work_deadline_requires_dispute_resolution_instead_of_late_submission() {
    let f = Fixture::new();
    f.individual();
    f.fund(&vec![&f.env, (f.organizer.clone(), 100)]);
    f.env.ledger().set_timestamp(10_000);
    assert_eq!(f.client().try_submit(&f.id), Err(Ok(Error::DeadlinePassed)));
    f.client().dispute(&f.id, &f.organizer);
    f.client().resolve(&f.id, &0);
    assert_eq!(f.client().refund(&f.id, &f.organizer), 100);
}

#[test]
fn cancellation_returns_partial_funding_but_cannot_reverse_fully_funded_work() {
    let f = Fixture::new();
    let plan = f.group();
    f.client().accept(&f.id);
    f.client().contribute(&f.id, &f.organizer);
    f.client().cancel(&f.id, &f.provider);
    assert_eq!(f.client().refund(&f.id, &f.organizer), 40);
    assert_eq!(
        f.client().try_contribute(&f.id, &plan.get(1).unwrap().0),
        Err(Ok(Error::InvalidState))
    );
    let next = Fixture::new();
    next.individual();
    next.fund(&vec![&next.env, (next.organizer.clone(), 100)]);
    assert_eq!(
        next.client().try_cancel(&next.id, &next.organizer),
        Err(Ok(Error::InvalidState))
    );
}

#[test]
fn invalid_plans_and_reused_identifiers_are_rejected() {
    let f = Fixture::new();
    let client = f.client();
    let duplicate = vec![&f.env, (f.organizer.clone(), 10), (f.organizer.clone(), 20)];
    assert_eq!(
        client.try_create(
            &f.id,
            &f.organizer,
            &f.provider,
            &duplicate,
            &2_000,
            &10_000
        ),
        Err(Ok(Error::InvalidTerms))
    );
    for amount in [0, -1, MAX_AMOUNT + 1] {
        let plan = vec![&f.env, (f.organizer.clone(), amount)];
        assert_eq!(
            client.try_create(&f.id, &f.organizer, &f.provider, &plan, &2_000, &10_000),
            Err(Ok(Error::InvalidTerms))
        );
    }
    let absent_organizer = vec![&f.env, (Address::generate(&f.env), 100)];
    assert_eq!(
        client.try_create(
            &f.id,
            &f.organizer,
            &f.provider,
            &absent_organizer,
            &2_000,
            &10_000
        ),
        Err(Ok(Error::InvalidTerms))
    );
    let plan = vec![&f.env, (f.organizer.clone(), 100)];
    for (funding, work) in [
        (1_000, 10_000),
        (2_000, 2_000),
        (1_000 + 8 * DAY, 1_000 + 9 * DAY),
    ] {
        assert_eq!(
            client.try_create(&f.id, &f.organizer, &f.provider, &plan, &funding, &work),
            Err(Ok(Error::InvalidTerms))
        );
    }
    f.individual();
    assert_eq!(
        client.try_create(&f.id, &f.organizer, &f.provider, &plan, &2_000, &10_000),
        Err(Ok(Error::Exists))
    );
}

#[test]
fn missing_signatures_cannot_accept_contribute_submit_release_or_resolve() {
    let f = Fixture::new();
    f.individual();
    f.env.set_auths(&[]);
    assert!(f.client().try_accept(&f.id).is_err());
    f.env.mock_all_auths();
    f.client().accept(&f.id);
    f.env.set_auths(&[]);
    assert!(f.client().try_contribute(&f.id, &f.organizer).is_err());
    f.env.mock_all_auths();
    f.client().contribute(&f.id, &f.organizer);
    f.env.set_auths(&[]);
    assert!(f.client().try_submit(&f.id).is_err());
    f.env.mock_all_auths();
    f.client().submit(&f.id);
    f.env.set_auths(&[]);
    assert!(f.client().try_release(&f.id).is_err());
    f.env.mock_all_auths();
    f.client().dispute(&f.id, &f.organizer);
    f.env.set_auths(&[]);
    assert!(f.client().try_resolve(&f.id, &100).is_err());
    assert_eq!(f.balance(&f.contract), 100);
}

#[test]
fn failed_token_transfer_rolls_back_contribution_state() {
    let f = Fixture::new();
    // Create without minting, to exercise a real token-contract failure.
    let plan = vec![&f.env, (f.organizer.clone(), 100)];
    f.client()
        .create(&f.id, &f.organizer, &f.provider, &plan, &2_000, &10_000);
    f.client().accept(&f.id);
    assert!(f.client().try_contribute(&f.id, &f.organizer).is_err());
    let booking = f.client().get_booking(&f.id);
    assert_eq!(booking.funded, 0);
    assert!(!booking.participants.get(0).unwrap().paid);
    assert_eq!(booking.state, State::Funding);
}

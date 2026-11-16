// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGoodDollar {
    function transfer(address to, uint256 amount) external returns (bool);
}

contract BookOneEscrow {
    enum State { Unfunded, Funded, Paid, Refunded }

    struct Payment {
        address payer;
        address provider;
        uint64 refundAfter;
        State state;
        uint256 amount;
    }

    IGoodDollar public immutable token;
    uint256 public constant REFUND_DELAY = 7 days;
    mapping(bytes32 => Payment) public payments;

    event Funded(bytes32 indexed key);
    event Released(bytes32 indexed key);
    event Refunded(bytes32 indexed key);

    error InvalidPayment();
    error Unauthorized();
    error TransferFailed();

    constructor(address goodDollar) {
        if (goodDollar.code.length == 0) revert InvalidPayment();
        token = IGoodDollar(goodDollar);
    }

    /// @notice Fund with GoodDollar transferAndCall using abi.encode(bookingId, provider).
    function onTokenTransfer(address payer, uint256 amount, bytes calldata data) external returns (bool) {
        if (msg.sender != address(token)) revert Unauthorized();
        (bytes32 bookingId, address provider) = abi.decode(data, (bytes32, address));
        if (bookingId == bytes32(0) || payer == address(0) || provider == address(0)
            || payer == provider || amount == 0) revert InvalidPayment();

        bytes32 key = keccak256(abi.encode(bookingId, payer, provider, amount));
        if (payments[key].state != State.Unfunded) revert InvalidPayment();
        payments[key] = Payment(payer, provider, uint64(block.timestamp + REFUND_DELAY), State.Funded, amount);
        emit Funded(key);
        return true;
    }

    function release(bytes32 key) external {
        Payment storage payment = payments[key];
        if (payment.state != State.Funded) revert InvalidPayment();
        if (msg.sender != payment.payer) revert Unauthorized();
        payment.state = State.Paid;
        if (!token.transfer(payment.provider, payment.amount)) revert TransferFailed();
        emit Released(key);
    }

    function refund(bytes32 key) external {
        Payment storage payment = payments[key];
        if (payment.state != State.Funded) revert InvalidPayment();
        if (msg.sender != payment.provider
            && (msg.sender != payment.payer || block.timestamp < payment.refundAfter)) revert Unauthorized();
        payment.state = State.Refunded;
        if (!token.transfer(payment.payer, payment.amount)) revert TransferFailed();
        emit Refunded(key);
    }
}

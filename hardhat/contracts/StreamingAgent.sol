// C:\Users\HP\Desktop\qday-streaming-agent\contracts\StreamingAgent.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IERC20.sol";

/**
 * @title GIMBLOCKCHAIN StreamPay AI - StreamingAgent
 * @author GIMBLOCKCHAIN
 * @notice Controlled AI payment streaming using tUSD8 on QDay Aevum.
 *
 * FEATURES:
 * - User-created payment streams
 * - Authorized AI agent payment streams
 * - Exact payment authorization
 * - Progressive fund withdrawals
 * - Stream cancellation and refunds
 * - Safe ERC20 transfers
 * - Reentrancy protection
 * - Balance accounting
 * - Overflow protection
 *
 * SECURITY NOTES:
 * - Deploy AgentAuthorization first.
 * - Deploy StreamingAgent second.
 * - Configure StreamingAgent in AgentAuthorization.
 * - Verify isWired() before using agent payments.
 * - Spending allowance is not restored after cancellation.
 * - Only vested funds can be withdrawn.
 * - Independent security review required before real funds.
 */

interface IAgentAuthorization {

    function consumePaymentAuthorization(
        address user,
        address agent,
        address recipient,
        uint256 amount,
        uint256 duration,
        bytes32 paymentId
    ) external;

    function streamingContract()
        external
        view
        returns (address);
}

contract StreamingAgent {

    // ==========================================
    // STATE VARIABLES
    // ==========================================

    IERC20 public immutable tUSD8;

    IAgentAuthorization public immutable authorization;

    uint256 public nextStreamId;

    uint256 private locked = 1;

    uint256 public totalEscrowed;

    // ==========================================
    // STREAM STRUCTURE
    // ==========================================

    struct Stream {

        address sender;

        address recipient;

        uint256 deposit;

        uint256 startTime;

        uint256 stopTime;

        uint256 withdrawn;

        uint256 cancelTime;

        bool cancelled;
    }

    mapping(uint256 => Stream) public streams;

    // ==========================================
    // EVENTS
    // ==========================================

    event StreamCreated(
        uint256 indexed streamId,
        address indexed sender,
        address indexed recipient,
        uint256 deposit,
        uint256 startTime,
        uint256 stopTime
    );

    event AgentStreamCreated(
        uint256 indexed streamId,
        address indexed user,
        address indexed agent,
        bytes32 paymentId
    );

    event Withdrawal(
        uint256 indexed streamId,
        address indexed recipient,
        uint256 amount
    );

    event StreamCancelled(
        uint256 indexed streamId,
        uint256 refund,
        uint256 vestedAmount
    );

    // ==========================================
    // SECURITY MODIFIERS
    // ==========================================

    modifier nonReentrant() {

        require(
            locked == 1,
            "Reentrant call"
        );

        locked = 2;

        _;

        locked = 1;
    }

    // ==========================================
    // CONSTRUCTOR
    // ==========================================

    constructor(
        address tokenAddress,
        address authorizationAddress
    ) {

        require(
            tokenAddress != address(0),
            "Invalid token"
        );

        require(
            authorizationAddress != address(0),
            "Invalid authorization"
        );

        require(
            tokenAddress != authorizationAddress,
            "Token equals authorization"
        );

        require(
            tokenAddress.code.length > 0,
            "Token is not a contract"
        );

        require(
            authorizationAddress.code.length > 0,
            "Authorization is not a contract"
        );

        tUSD8 = IERC20(tokenAddress);

        authorization =
            IAgentAuthorization(authorizationAddress);
    }

    // ==========================================
    // 1. CREATE NORMAL PAYMENT STREAM
    // ==========================================

    /**
     * @notice Create a payment stream directly.
     * @dev Requires prior ERC20 approval.
     */
    function createStream(
        address recipient,
        uint256 deposit,
        uint256 durationSeconds
    )
        external
        nonReentrant
        returns (uint256)
    {

        return _createStream(
            msg.sender,
            recipient,
            deposit,
            durationSeconds
        );
    }

    // ==========================================
    // 2. CREATE AI AGENT PAYMENT STREAM
    // ==========================================

    /**
     * @notice Create a stream through an authorized AI agent.
     * @dev Authorization must match the exact payment.
     */
    function createStreamFor(
        address user,
        address recipient,
        uint256 deposit,
        uint256 durationSeconds,
        bytes32 paymentId
    )
        external
        nonReentrant
        returns (uint256 streamId)
    {

        require(
            user != address(0),
            "Invalid user"
        );

        // Validate and consume payment authorization.
        authorization.consumePaymentAuthorization(
            user,
            msg.sender,
            recipient,
            deposit,
            durationSeconds,
            paymentId
        );

        streamId = _createStream(
            user,
            recipient,
            deposit,
            durationSeconds
        );

        emit AgentStreamCreated(
            streamId,
            user,
            msg.sender,
            paymentId
        );
    }

    // ==========================================
    // 3. INTERNAL STREAM CREATION
    // ==========================================

    function _createStream(
        address sender,
        address recipient,
        uint256 deposit,
        uint256 durationSeconds
    )
        internal
        returns (uint256 streamId)
    {

        require(
            sender != address(0),
            "Invalid sender"
        );

        require(
            recipient != address(0),
            "Invalid recipient"
        );

        require(
            sender != recipient,
            "Invalid recipient"
        );

        require(
            deposit > 0,
            "Invalid deposit"
        );

        require(
            durationSeconds > 0,
            "Invalid duration"
        );

        require(
            durationSeconds <=
                type(uint256).max - block.timestamp,
            "Duration overflow"
        );

        uint256 start = block.timestamp;

        uint256 stop = start + durationSeconds;

        uint256 balanceBefore =
            tUSD8.balanceOf(address(this));

        _safeTransferFrom(
            sender,
            address(this),
            deposit
        );

        uint256 balanceAfter =
            tUSD8.balanceOf(address(this));

        require(
            balanceAfter >= balanceBefore,
            "Invalid balance change"
        );

        require(
            balanceAfter - balanceBefore == deposit,
            "Unexpected token amount"
        );

        totalEscrowed += deposit;

        streamId = nextStreamId++;

        streams[streamId] = Stream({

            sender: sender,

            recipient: recipient,

            deposit: deposit,

            startTime: start,

            stopTime: stop,

            withdrawn: 0,

            cancelTime: 0,

            cancelled: false

        });

        emit StreamCreated(
            streamId,
            sender,
            recipient,
            deposit,
            start,
            stop
        );
    }

    // ==========================================
    // 4. VESTED AMOUNT CALCULATION
    // ==========================================

    function _vestedAmount(
        Stream storage stream
    )
        internal
        view
        returns (uint256)
    {

        uint256 effectiveTime = block.timestamp;

        if (
            effectiveTime > stream.stopTime
        ) {

            effectiveTime = stream.stopTime;
        }

        if (
            stream.cancelled &&
            effectiveTime > stream.cancelTime
        ) {

            effectiveTime = stream.cancelTime;
        }

        if (
            effectiveTime <= stream.startTime
        ) {

            return 0;
        }

        if (
            effectiveTime >= stream.stopTime
        ) {

            return stream.deposit;
        }

        uint256 elapsed =
            effectiveTime - stream.startTime;

        uint256 duration =
            stream.stopTime - stream.startTime;

        return (
            stream.deposit * elapsed
        ) / duration;
    }

    // ==========================================
    // 5. AVAILABLE WITHDRAWAL BALANCE
    // ==========================================

    function balanceOf(
        uint256 streamId
    )
        public
        view
        returns (uint256)
    {

        Stream storage stream = streams[streamId];

        require(
            stream.sender != address(0),
            "Stream does not exist"
        );

        uint256 vested = _vestedAmount(stream);

        return vested - stream.withdrawn;
    }

    // ==========================================
    // 6. WITHDRAW AVAILABLE FUNDS
    // ==========================================

    function withdraw(
        uint256 streamId
    ) external nonReentrant {

        Stream storage stream = streams[streamId];

        require(
            stream.sender != address(0),
            "Stream does not exist"
        );

        require(
            msg.sender == stream.recipient,
            "Only recipient"
        );

        uint256 amount = balanceOf(streamId);

        require(
            amount > 0,
            "No funds available"
        );

        stream.withdrawn += amount;

        totalEscrowed -= amount;

        _safeTransfer(
            stream.recipient,
            amount
        );

        emit Withdrawal(
            streamId,
            stream.recipient,
            amount
        );
    }

    // ==========================================
    // 7. CANCEL PAYMENT STREAM
    // ==========================================

    /**
     * @notice Sender cancels an active stream.
     * @dev Recipient keeps vested funds.
     *      Sender receives unvested funds.
     *      Agent spending allowance is not restored.
     */
    function cancelStream(
        uint256 streamId
    ) external nonReentrant {

        Stream storage stream = streams[streamId];

        require(
            stream.sender != address(0),
            "Stream does not exist"
        );

        require(
            msg.sender == stream.sender,
            "Only sender"
        );

        require(
            !stream.cancelled,
            "Already cancelled"
        );

        uint256 vested = _vestedAmount(stream);

        uint256 refund =
            stream.deposit - vested;

        stream.cancelled = true;

        stream.cancelTime = block.timestamp;

        if (refund > 0) {

            totalEscrowed -= refund;

            _safeTransfer(
                stream.sender,
                refund
            );
        }

        emit StreamCancelled(
            streamId,
            refund,
            vested
        );
    }

    // ==========================================
    // 8. ESCROW ACCOUNTING
    // ==========================================

    function contractTokenBalance()
        external
        view
        returns (uint256)
    {

        return tUSD8.balanceOf(address(this));
    }

    function escrowSolvent()
        external
        view
        returns (bool)
    {

        return (
            tUSD8.balanceOf(address(this))
            >= totalEscrowed
        );
    }

    // ==========================================
    // 9. CONTRACT CONNECTION CHECK
    // ==========================================

    function isWired()
        external
        view
        returns (bool)
    {

        return (
            authorization.streamingContract()
            == address(this)
        );
    }

    // ==========================================
    // 10. SAFE ERC20 TRANSFERS
    // ==========================================

    function _safeTransfer(
        address recipient,
        uint256 amount
    ) internal {

        (bool success, bytes memory data) =
            address(tUSD8).call(
                abi.encodeWithSelector(
                    IERC20.transfer.selector,
                    recipient,
                    amount
                )
            );

        require(
            success &&
            (
                data.length == 0 ||
                (
                    data.length >= 32 &&
                    abi.decode(data, (bool))
                )
            ),
            "Token transfer failed"
        );
    }

    function _safeTransferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) internal {

        (bool success, bytes memory data) =
            address(tUSD8).call(
                abi.encodeWithSelector(
                    IERC20.transferFrom.selector,
                    sender,
                    recipient,
                    amount
                )
            );

        require(
            success &&
            (
                data.length == 0 ||
                (
                    data.length >= 32 &&
                    abi.decode(data, (bool))
                )
            ),
            "Token transferFrom failed"
        );
    }
}

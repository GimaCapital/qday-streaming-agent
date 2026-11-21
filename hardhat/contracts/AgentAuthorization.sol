// C:\Users\HP\Desktop\qday-streaming-agent\test\AgentAuthorization.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GIMBLOCKCHAIN StreamPay AI - AgentAuthorization
 * @author GIMBLOCKCHAIN
 * @notice Controlled AI agent payment authorization on QDay Aevum.
 *
 * FEATURES:
 * - User-controlled AI agent authorization
 * - Total spending limits (per authorization epoch, see notes)
 * - Individual payment limits
 * - Permission expiration
 * - Payment approval expiration
 * - Immediate agent revocation
 * - Permission epoch protection
 * - Exact payment approvals
 * - Payment ownership verification
 * - One-time payment execution
 * - Individual payment revocation
 * - Streaming contract access control
 * - Two-step administrative ownership transfer
 *
 * SECURITY NOTES:
 * - `streamingContract` is set once and cannot be changed. Only that
 *   address can consume approvals, so it must be audited and final
 *   before configuration.
 * - `owner` can ONLY configure the streaming contract (once). It has no
 *   power over user permissions or funds, but protect the key anyway
 *   (multisig recommended) until the streaming contract is configured.
 * - `spent` is tracked per authorization epoch, NOT lifetime. Calling
 *   authorizeAgent again resets `spent` to zero. Revoking and
 *   reauthorizing therefore grants a fresh allowance. Off-chain
 *   accounting must track lifetime totals via PaymentExecuted events.
 * - Compilation is not proof of security. Obtain an independent review
 *   before deploying with real funds.
 */

contract AgentAuthorization {

    // ==========================================
    // STATE VARIABLES
    // ==========================================

    address public owner;

    address public pendingOwner;

    address public streamingContract;

    uint256 public paymentNonce;

    // ==========================================
    // AGENT PERMISSIONS
    // ==========================================

    struct AgentPermission {

        bool enabled;

        uint256 maxTotalSpend;

        uint256 maxPerPayment;

        // Spent within the CURRENT authorization only.
        // Reset to zero by authorizeAgent.
        uint256 spent;

        uint256 expiresAt;

        // Incremented whenever permissions are revoked,
        // replaced or their limits updated.
        uint256 epoch;
    }

    mapping(address => mapping(address => AgentPermission))
        public permissions;

    // ==========================================
    // PAYMENT APPROVALS
    // ==========================================

    struct PaymentApproval {

        address agent;

        address recipient;

        uint256 amount;

        uint256 duration;

        uint256 permissionEpoch;

        uint256 approvalExpiresAt;

        bool exists;
    }

    mapping(bytes32 => PaymentApproval)
        public paymentApprovals;

    // Identifies the wallet that approved each payment.
    mapping(bytes32 => address)
        public paymentOwners;

    // ==========================================
    // EVENTS
    // ==========================================

    event StreamingContractConfigured(
        address indexed streamingContract
    );

    event OwnershipTransferStarted(
        address indexed currentOwner,
        address indexed pendingOwner
    );

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    event AgentAuthorized(
        address indexed user,
        address indexed agent,
        uint256 maxTotalSpend,
        uint256 maxPerPayment,
        uint256 expiresAt,
        uint256 epoch
    );

    event AgentRevoked(
        address indexed user,
        address indexed agent,
        uint256 epoch
    );

    event PaymentApproved(
        bytes32 indexed paymentId,
        address indexed user,
        address indexed agent,
        address recipient,
        uint256 amount,
        uint256 duration,
        uint256 approvalExpiresAt,
        uint256 epoch
    );

    event PaymentApprovalRevoked(
        bytes32 indexed paymentId,
        address indexed user
    );

    event PaymentExecuted(
        bytes32 indexed paymentId,
        address indexed user,
        address indexed agent,
        address recipient,
        uint256 amount
    );

    event SpendingLimitUpdated(
        address indexed user,
        address indexed agent,
        uint256 maxTotalSpend,
        uint256 maxPerPayment,
        uint256 epoch
    );

    // ==========================================
    // MODIFIERS
    // ==========================================

    modifier onlyOwner() {

        require(
            msg.sender == owner,
            "Not contract owner"
        );

        _;
    }

    modifier onlyStreamingContract() {

        require(
            msg.sender == streamingContract,
            "Only streaming contract"
        );

        _;
    }

    // ==========================================
    // CONSTRUCTOR
    // ==========================================

    constructor() {

        owner = msg.sender;
    }

    // ==========================================
    // 1. CONFIGURE STREAMING CONTRACT
    // ==========================================

    /**
     * @notice Connect the official StreamingAgent.
     * @dev Can only be configured once. Irreversible.
     */
    function setStreamingContract(
        address _streamingContract
    ) external onlyOwner {

        require(
            streamingContract == address(0),
            "Already configured"
        );

        require(
            _streamingContract != address(0),
            "Invalid contract"
        );

        require(
            _streamingContract.code.length > 0,
            "Not a contract"
        );

        streamingContract = _streamingContract;

        emit StreamingContractConfigured(
            _streamingContract
        );
    }

    // ==========================================
    // 2. AUTHORIZE AI AGENT
    // ==========================================

    /**
     * @notice Give an AI agent limited payment permissions.
     * @dev Reauthorizing invalidates old approvals and resets `spent`
     *      (spending is per authorization epoch, not lifetime).
     */
    function authorizeAgent(
        address agent,
        uint256 maxTotalSpend,
        uint256 maxPerPayment,
        uint256 expiresAt
    ) external {

        require(
            agent != address(0),
            "Invalid agent"
        );

        require(
            agent != msg.sender,
            "Agent cannot be owner"
        );

        require(
            maxTotalSpend > 0,
            "Invalid total limit"
        );

        require(
            maxPerPayment > 0,
            "Invalid payment limit"
        );

        require(
            maxPerPayment <= maxTotalSpend,
            "Payment limit exceeds total"
        );

        require(
            expiresAt > block.timestamp,
            "Invalid expiration"
        );

        AgentPermission storage permission =
            permissions[msg.sender][agent];

        // Increment epoch to invalidate previous approvals.
        permission.epoch += 1;

        permission.enabled = true;

        permission.maxTotalSpend = maxTotalSpend;

        permission.maxPerPayment = maxPerPayment;

        // A new authorization starts a fresh spending period.
        permission.spent = 0;

        permission.expiresAt = expiresAt;

        emit AgentAuthorized(
            msg.sender,
            agent,
            maxTotalSpend,
            maxPerPayment,
            expiresAt,
            permission.epoch
        );
    }

    // ==========================================
    // 3. REVOKE AI AGENT
    // ==========================================

    /**
     * @notice Immediately disable an authorized AI agent.
     */
    function revokeAgent(
        address agent
    ) external {

        AgentPermission storage permission =
            permissions[msg.sender][agent];

        require(
            permission.enabled,
            "Agent not authorized"
        );

        permission.enabled = false;

        // Invalidates every previously approved instruction.
        permission.epoch += 1;

        emit AgentRevoked(
            msg.sender,
            agent,
            permission.epoch
        );
    }

    // ==========================================
    // 4. UPDATE SPENDING LIMITS
    // ==========================================

    /**
     * @notice Update spending limits.
     * @dev Incrementing epoch invalidates old approvals. `spent` is
     *      preserved.
     */
    function updateSpendingLimits(
        address agent,
        uint256 maxTotalSpend,
        uint256 maxPerPayment
    ) external {

        AgentPermission storage permission =
            permissions[msg.sender][agent];

        require(
            permission.enabled,
            "Agent not authorized"
        );

        require(
            block.timestamp < permission.expiresAt,
            "Permission expired"
        );

        require(
            maxTotalSpend > 0,
            "Invalid total limit"
        );

        require(
            maxPerPayment > 0,
            "Invalid payment limit"
        );

        require(
            maxPerPayment <= maxTotalSpend,
            "Payment limit exceeds total"
        );

        require(
            maxTotalSpend >= permission.spent,
            "Below amount already spent"
        );

        permission.maxTotalSpend = maxTotalSpend;

        permission.maxPerPayment = maxPerPayment;

        permission.epoch += 1;

        emit SpendingLimitUpdated(
            msg.sender,
            agent,
            maxTotalSpend,
            maxPerPayment,
            permission.epoch
        );
    }

    // ==========================================
    // 5. APPROVE EXACT PAYMENT
    // ==========================================

    /**
     * @notice Approve an exact AI payment instruction.
     * @dev Only the user's wallet can approve a payment. The approval
     *      must be consumed before `approvalExpiresAt`, which cannot
     *      exceed the agent permission expiry.
     */
    function approvePayment(
        address agent,
        address recipient,
        uint256 amount,
        uint256 duration,
        uint256 approvalExpiresAt
    ) external returns (bytes32 paymentId) {

        AgentPermission storage permission =
            permissions[msg.sender][agent];

        require(
            permission.enabled,
            "Agent not authorized"
        );

        require(
            block.timestamp < permission.expiresAt,
            "Agent permission expired"
        );

        require(
            recipient != address(0),
            "Invalid recipient"
        );

        require(
            recipient != msg.sender,
            "Invalid recipient"
        );

        require(
            amount > 0,
            "Invalid amount"
        );

        require(
            duration > 0,
            "Invalid duration"
        );

        require(
            duration <= type(uint256).max - block.timestamp,
            "Duration overflow"
        );

        require(
            approvalExpiresAt > block.timestamp,
            "Invalid approval expiration"
        );

        require(
            approvalExpiresAt <= permission.expiresAt,
            "Approval outlives permission"
        );

        require(
            amount <= permission.maxPerPayment,
            "Payment exceeds limit"
        );

        require(
            permission.spent <= permission.maxTotalSpend &&
            amount <= permission.maxTotalSpend - permission.spent,
            "Total spending limit exceeded"
        );

        // The unique nonce makes every paymentId distinct, so
        // approvalExpiresAt is not part of the hash.
        paymentId = keccak256(
            abi.encode(
                address(this),
                block.chainid,
                msg.sender,
                agent,
                recipient,
                amount,
                duration,
                permission.epoch,
                paymentNonce++
            )
        );

        paymentApprovals[paymentId] = PaymentApproval({

            agent: agent,

            recipient: recipient,

            amount: amount,

            duration: duration,

            permissionEpoch: permission.epoch,

            approvalExpiresAt: approvalExpiresAt,

            exists: true

        });

        // Essential: records the actual approving wallet.
        paymentOwners[paymentId] = msg.sender;

        emit PaymentApproved(
            paymentId,
            msg.sender,
            agent,
            recipient,
            amount,
            duration,
            approvalExpiresAt,
            permission.epoch
        );
    }

    // ==========================================
    // 6. REVOKE INDIVIDUAL PAYMENT
    // ==========================================

    /**
     * @notice Cancel a payment instruction before execution.
     * @dev Does not affect `spent`: nothing is counted until consumed.
     */
    function revokePayment(
        bytes32 paymentId
    ) external {

        PaymentApproval storage approval =
            paymentApprovals[paymentId];

        require(
            approval.exists,
            "Approval not found"
        );

        require(
            paymentOwners[paymentId] == msg.sender,
            "Not payment owner"
        );

        delete paymentApprovals[paymentId];

        delete paymentOwners[paymentId];

        emit PaymentApprovalRevoked(
            paymentId,
            msg.sender
        );
    }

    // ==========================================
    // 7. CONSUME PAYMENT AUTHORIZATION
    // ==========================================

    /**
     * @notice Validate and consume an approved payment.
     * @dev Only StreamingAgent can execute this function.
     *
     * Validates:
     * - Payment ownership
     * - Agent identity
     * - Recipient
     * - Exact amount
     * - Exact duration
     * - Approval expiration
     * - Agent permission
     * - Permission expiration
     * - Permission epoch
     * - Individual payment limit
     * - Total spending limit
     *
     * The payment approval is consumed exactly once.
     */
    function consumePaymentAuthorization(
        address user,
        address agent,
        address recipient,
        uint256 amount,
        uint256 duration,
        bytes32 paymentId
    )
        external
        onlyStreamingContract
    {

        PaymentApproval storage approval =
            paymentApprovals[paymentId];

        require(
            approval.exists,
            "Payment not approved"
        );

        require(
            paymentOwners[paymentId] == user,
            "Wrong payment owner"
        );

        require(
            approval.agent == agent,
            "Wrong agent"
        );

        require(
            approval.recipient == recipient,
            "Wrong recipient"
        );

        require(
            approval.amount == amount,
            "Wrong amount"
        );

        require(
            approval.duration == duration,
            "Wrong duration"
        );

        require(
            block.timestamp < approval.approvalExpiresAt,
            "Approval expired"
        );

        AgentPermission storage permission =
            permissions[user][agent];

        require(
            permission.enabled,
            "Agent revoked"
        );

        require(
            block.timestamp < permission.expiresAt,
            "Permission expired"
        );

        // Prevent stale approvals after revocation,
        // limit changes or permission renewal.
        require(
            approval.permissionEpoch == permission.epoch,
            "Payment authorization revoked"
        );

        require(
            amount <= permission.maxPerPayment,
            "Payment exceeds limit"
        );

        require(
            permission.spent <= permission.maxTotalSpend &&
            amount <= permission.maxTotalSpend - permission.spent,
            "Total spending limit exceeded"
        );

        // Consume authorization before external execution.
        permission.spent += amount;

        delete paymentApprovals[paymentId];

        delete paymentOwners[paymentId];

        emit PaymentExecuted(
            paymentId,
            user,
            agent,
            recipient,
            amount
        );
    }

    // ==========================================
    // 8. VIEW AGENT PERMISSION STATUS
    // ==========================================

    function isAgentAuthorized(
        address user,
        address agent
    ) external view returns (bool) {

        AgentPermission storage permission =
            permissions[user][agent];

        return (
            permission.enabled &&
            block.timestamp < permission.expiresAt
        );
    }

    // ==========================================
    // 9. VIEW REMAINING SPENDING LIMIT
    // ==========================================

    /**
     * @notice Remaining allowance in the current authorization epoch.
     */
    function remainingAllowance(
        address user,
        address agent
    ) external view returns (uint256) {

        AgentPermission storage permission =
            permissions[user][agent];

        if (
            !permission.enabled ||
            block.timestamp >= permission.expiresAt ||
            permission.spent >= permission.maxTotalSpend
        ) {
            return 0;
        }

        return (
            permission.maxTotalSpend - permission.spent
        );
    }

    // ==========================================
    // 10. VIEW PAYMENT APPROVAL OWNER
    // ==========================================

    function getPaymentOwner(
        bytes32 paymentId
    ) external view returns (address) {

        return paymentOwners[paymentId];
    }

    // ==========================================
    // 11. OWNERSHIP MANAGEMENT (TWO-STEP)
    // ==========================================

    /**
     * @notice Nominate a new administrative owner.
     * @dev The nominee must call acceptOwnership, which prevents
     *      transferring to a mistyped or unreachable address.
     *      User agent permissions remain user-controlled.
     */
    function transferOwnership(
        address newOwner
    ) external onlyOwner {

        require(
            newOwner != address(0),
            "Invalid owner"
        );

        pendingOwner = newOwner;

        emit OwnershipTransferStarted(
            owner,
            newOwner
        );
    }

    function acceptOwnership() external {

        require(
            msg.sender == pendingOwner,
            "Not pending owner"
        );

        address previousOwner = owner;

        owner = msg.sender;

        pendingOwner = address(0);

        emit OwnershipTransferred(
            previousOwner,
            msg.sender
        );
    }
}
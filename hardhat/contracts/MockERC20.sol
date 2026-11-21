// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockERC20
 * @notice Minimal ERC20 for testing. Kept inside hardhat/contracts so it
 *         does not pollute the main ../contracts folder.
 */
contract MockERC20 {
    string public constant name = "Mock tUSD8";
    string public constant symbol = "tUSD8";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        require(to != address(0), "Invalid recipient");
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");

        if (a != type(uint256).max) {
            allowance[from][msg.sender] = a - amount;
        }

        _transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "Invalid sender");
        require(to != address(0), "Invalid recipient");
        require(balanceOf[from] >= amount, "balance");

        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        emit Transfer(from, to, amount);
    }
}

/**
 * @title MockStreamingContract
 * @notice Stub that impersonates the streaming contract for
 *         AgentAuthorization unit tests.
 *
 *         It forwards `consumePaymentAuthorization` to the real
 *         AgentAuthorization contract. Because the stub itself is the
 *         configured `streamingContract` on AgentAuthorization, the
 *         forwarded call has `msg.sender == address(stub)`, which
 *         satisfies `onlyStreamingContract`.
 *
 *         The `auth` address is passed explicitly as the first argument
 *         because the stub is not constructed with it.
 */
interface IAgentAuthorizationConsume {
    function consumePaymentAuthorization(
        address user,
        address agent,
        address recipient,
        uint256 amount,
        uint256 duration,
        bytes32 paymentId
    ) external;
}

contract MockStreamingContract {
    function consumePaymentAuthorization(
        address auth,
        address user,
        address agent,
        address recipient,
        uint256 amount,
        uint256 duration,
        bytes32 paymentId
    ) external {
        IAgentAuthorizationConsume(auth).consumePaymentAuthorization(
            user,
            agent,
            recipient,
            amount,
            duration,
            paymentId
        );
    }
}
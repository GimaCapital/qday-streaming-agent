
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IERC20
 * @author GIMBLOCKCHAIN
 * @notice Standard ERC-20 token interface for StreamPay AI.
 * @dev Compatible with tUSD8 and other ERC-20 tokens.
 */

interface IERC20 {

    // ==========================================
    // EVENTS
    // ==========================================

    event Transfer(
        address indexed from,
        address indexed to,
        uint256 value
    );

    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    // ==========================================
    // TOKEN INFORMATION
    // ==========================================

    function totalSupply()
        external
        view
        returns (uint256);

    function balanceOf(
        address account
    )
        external
        view
        returns (uint256);

    // ==========================================
    // TOKEN TRANSFERS
    // ==========================================

    function transfer(
        address to,
        uint256 value
    )
        external
        returns (bool);

    // ==========================================
    // ALLOWANCES
    // ==========================================

    function allowance(
        address tokenOwner,
        address spender
    )
        external
        view
        returns (uint256);

    function approve(
        address spender,
        uint256 value
    )
        external
        returns (bool);

    function transferFrom(
        address from,
        address to,
        uint256 value
    )
        external
        returns (bool);

    // ==========================================
    // OPTIONAL ERC-20 METADATA
    // ==========================================

    function name()
        external
        view
        returns (string memory);

    function symbol()
        external
        view
        returns (string memory);

    function decimals()
        external
        view
        returns (uint8);
}

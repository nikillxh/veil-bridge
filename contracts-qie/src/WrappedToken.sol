// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title WrappedToken
/// @notice The QIE-side wrapped representation of the asset locked in the
///         source ShieldedVault. Mintable only by the ShieldedPool (on a valid
///         shielded claim) and burnable by it (for the Phase 5 return path).
contract WrappedToken is ERC20, Ownable {
    /// @notice The only address allowed to mint/burn (the ShieldedPool).
    address public minter;
    /// @notice Decimals mirror the bridged source asset (USDC == 6).
    uint8 private immutable _decimals;

    event MinterUpdated(address indexed oldMinter, address indexed newMinter);

    error NotMinter();

    modifier onlyMinter() {
        if (msg.sender != minter) revert NotMinter();
        _;
    }

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address owner_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function setMinter(address _minter) external onlyOwner {
        emit MinterUpdated(minter, _minter);
        minter = _minter;
    }

    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyMinter {
        _burn(from, amount);
    }
}

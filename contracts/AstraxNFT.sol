// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}

/// @title AstraxNFT
/// @notice A 1-of-1 ERC-721 used by Astrax's `deployNFT` tool. Token #1 is minted to the
///         deployer in the constructor and there is no mint function, so the supply is fixed.
contract AstraxNFT {
    string public name;
    string public symbol;
    uint256 public constant totalSupply = 1;

    string private _tokenURI;
    address private _holder;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    error NoToken();
    error NotAuthorized();
    error WrongOwner();
    error ZeroAddress();
    error UnsafeRecipient();

    constructor(string memory _name, string memory _symbol, string memory uri) {
        name = _name;
        symbol = _symbol;
        _tokenURI = uri;
        _holder = msg.sender;
        emit Transfer(address(0), msg.sender, 1);
    }

    function balanceOf(address account) external view returns (uint256) {
        if (account == address(0)) revert ZeroAddress();
        return account == _holder ? 1 : 0;
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        if (tokenId != 1) revert NoToken();
        return _holder;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (tokenId != 1) revert NoToken();
        return _tokenURI;
    }

    function approve(address to, uint256 tokenId) external {
        address tokenOwner = ownerOf(tokenId);
        if (msg.sender != tokenOwner && !_operatorApprovals[tokenOwner][msg.sender]) revert NotAuthorized();
        _tokenApprovals[tokenId] = to;
        emit Approval(tokenOwner, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        ownerOf(tokenId);
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address tokenOwner, address operator) external view returns (bool) {
        return _operatorApprovals[tokenOwner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        address tokenOwner = ownerOf(tokenId);
        if (tokenOwner != from) revert WrongOwner();
        if (to == address(0)) revert ZeroAddress();
        if (msg.sender != from && _tokenApprovals[tokenId] != msg.sender && !_operatorApprovals[from][msg.sender]) {
            revert NotAuthorized();
        }
        delete _tokenApprovals[tokenId];
        _holder = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length > 0) {
            try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 ret) {
                if (ret != IERC721Receiver.onERC721Received.selector) revert UnsafeRecipient();
            } catch {
                revert UnsafeRecipient();
            }
        }
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x80ac58cd || interfaceId == 0x5b5e139f;
    }
}

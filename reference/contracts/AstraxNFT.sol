// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AstraxNFT - minimal mintable ERC-721 used by Astrax's deployNFT tool
contract AstraxNFT {
    string public name;
    string public symbol;
    uint256 public totalSupply;
    address public owner;
    string public baseURI;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    constructor(string memory _name, string memory _symbol, string memory _baseURI) {
        name = _name;
        symbol = _symbol;
        baseURI = _baseURI;
        owner = msg.sender;
    }

    function balanceOf(address a) external view returns (uint256) {
        require(a != address(0), "zero");
        return _balances[a];
    }

    function ownerOf(uint256 id) public view returns (address) {
        address o = _owners[id];
        require(o != address(0), "no token");
        return o;
    }

    /// @notice Mint the next token id to `to`. Open mint for demo/testnet use.
    function mint(address to) external returns (uint256) {
        require(to != address(0), "zero");
        totalSupply += 1;
        uint256 id = totalSupply;
        _owners[id] = to;
        _balances[to] += 1;
        emit Transfer(address(0), to, id);
        return id;
    }

    function approve(address to, uint256 id) external {
        address o = ownerOf(id);
        require(msg.sender == o || _operatorApprovals[o][msg.sender], "not auth");
        _tokenApprovals[id] = to;
        emit Approval(o, to, id);
    }

    function getApproved(uint256 id) external view returns (address) {
        require(_owners[id] != address(0), "no token");
        return _tokenApprovals[id];
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address o, address operator) external view returns (bool) {
        return _operatorApprovals[o][operator];
    }

    function transferFrom(address from, address to, uint256 id) public {
        require(ownerOf(id) == from, "wrong from");
        require(to != address(0), "zero");
        require(
            msg.sender == from || _tokenApprovals[id] == msg.sender || _operatorApprovals[from][msg.sender],
            "not auth"
        );
        _tokenApprovals[id] = address(0);
        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[id] = to;
        emit Transfer(from, to, id);
    }

    function safeTransferFrom(address from, address to, uint256 id) external {
        transferFrom(from, to, id);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd || interfaceId == 0x01ffc9a7;
    }
}

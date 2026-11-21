import { expect } from "chai";
import hre from "hardhat";

const { ethers, networkHelpers } = await hre.network.create();
const { time, loadFixture } = networkHelpers;

describe("AgentAuthorization", function () {
  const MAX_TOTAL = ethers.parseEther("1000");
  const MAX_PER_PAY = ethers.parseEther("100");
  const DURATION = 24 * 60 * 60;
  const PERM_EXPIRY = 30 * 24 * 60 * 60;

  interface Fixture {
    auth: any;
    authAddress: string;
    stub: any;
    stubAddress: string;
    owner: any;
    user: any;
    agent: any;
    recipient: any;
    streaming: any;
  }

  async function deployFixture(): Promise<Fixture> {
    const [owner, user, agent, recipient, streaming] = await ethers.getSigners();

    const Auth = await ethers.getContractFactory("AgentAuthorization");
    const auth: any = await Auth.deploy();
    await auth.waitForDeployment();
    const authAddress: string = await auth.getAddress();

    const Stub = await ethers.getContractFactory("MockStreamingContract");
    const stub: any = await Stub.deploy();
    await stub.waitForDeployment();
    const stubAddress: string = await stub.getAddress();

    await auth.setStreamingContract(stubAddress);

    return {
      auth,
      authAddress,
      stub,
      stubAddress,
      owner,
      user,
      agent,
      recipient,
      streaming,
    };
  }

  function consumeViaStub(
    authAddress: string,
    stub: any,
    user: string,
    agent: string,
    recipient: string,
    amount: bigint,
    duration: number | bigint,
    paymentId: string
  ): Promise<any> {
    return stub.consumePaymentAuthorization(
      authAddress,
      user,
      agent,
      recipient,
      amount,
      duration,
      paymentId
    );
  }

  describe("Configuration", function () {
    it("sets streaming contract once", async function () {
      const { auth, stubAddress } = await loadFixture(deployFixture);
      expect(await auth.streamingContract()).to.equal(stubAddress);
    });

    it("rejects second configuration", async function () {
      const { auth, stubAddress } = await loadFixture(deployFixture);
      await expect(auth.setStreamingContract(stubAddress)).to.be.revertedWith(
        "Already configured"
      );
    });

    it("rejects zero address", async function () {
      const Auth = await ethers.getContractFactory("AgentAuthorization");
      const fresh: any = await Auth.deploy();
      await fresh.waitForDeployment();
      await expect(fresh.setStreamingContract(ethers.ZeroAddress)).to.be.revertedWith(
        "Invalid contract"
      );
    });

    it("rejects EOA", async function () {
      const { user } = await loadFixture(deployFixture);
      const Auth = await ethers.getContractFactory("AgentAuthorization");
      const fresh: any = await Auth.deploy();
      await fresh.waitForDeployment();
      await expect(fresh.setStreamingContract(user.address)).to.be.revertedWith(
        "Not a contract"
      );
    });
  });

  describe("authorizeAgent", function () {
    it("authorizes agent", async function () {
      const { auth, user, agent } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await expect(
        auth
          .connect(user)
          .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY))
      ).to.emit(auth, "AgentAuthorized");

      const perm = await auth.permissions(user.address, agent.address);
      expect(perm.enabled).to.be.true;
      expect(perm.maxTotalSpend).to.equal(MAX_TOTAL);
      expect(perm.maxPerPayment).to.equal(MAX_PER_PAY);
      expect(perm.spent).to.equal(0n);
      expect(perm.epoch).to.equal(1n);
      expect(await auth.isAgentAuthorized(user.address, agent.address)).to.be.true;
    });

    it("rejects zero agent", async function () {
      const { auth, user } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await expect(
        auth
          .connect(user)
          .authorizeAgent(ethers.ZeroAddress, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY))
      ).to.be.revertedWith("Invalid agent");
    });

    it("rejects self", async function () {
      const { auth, user } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await expect(
        auth
          .connect(user)
          .authorizeAgent(user.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY))
      ).to.be.revertedWith("Agent cannot be owner");
    });

    it("rejects zero total", async function () {
      const { auth, user, agent } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await expect(
        auth
          .connect(user)
          .authorizeAgent(agent.address, 0n, MAX_PER_PAY, now + BigInt(PERM_EXPIRY))
      ).to.be.revertedWith("Invalid total limit");
    });

    it("rejects per-pay > total", async function () {
      const { auth, user, agent } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await expect(
        auth
          .connect(user)
          .authorizeAgent(agent.address, 100n, 200n, now + BigInt(PERM_EXPIRY))
      ).to.be.revertedWith("Payment limit exceeds total");
    });

    it("rejects past expiration", async function () {
      const { auth, user, agent } = await loadFixture(deployFixture);
      await expect(
        auth.connect(user).authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, 1n)
      ).to.be.revertedWith("Invalid expiration");
    });

    it("reauthorization resets spent and bumps epoch", async function () {
      const { auth, authAddress, user, agent, recipient, stub } = await loadFixture(
        deployFixture
      );
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));

      const pid: string = await auth.connect(user).approvePayment.staticCall(
        agent.address,
        recipient.address,
        ethers.parseEther("50"),
        DURATION,
        now + 86400n
      );
      await auth
        .connect(user)
        .approvePayment(
          agent.address,
          recipient.address,
          ethers.parseEther("50"),
          DURATION,
          now + 86400n
        );
      await consumeViaStub(
        authAddress,
        stub,
        user.address,
        agent.address,
        recipient.address,
        ethers.parseEther("50"),
        DURATION,
        pid
      );

      let perm = await auth.permissions(user.address, agent.address);
      expect(perm.spent).to.equal(ethers.parseEther("50"));
      expect(perm.epoch).to.equal(1n);

      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));

      perm = await auth.permissions(user.address, agent.address);
      expect(perm.spent).to.equal(0n);
      expect(perm.epoch).to.equal(2n);
    });
  });

  describe("revokeAgent", function () {
    it("disables agent and bumps epoch", async function () {
      const { auth, user, agent } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      await expect(auth.connect(user).revokeAgent(agent.address))
        .to.emit(auth, "AgentRevoked")
        .withArgs(user.address, agent.address, 2n);

      const perm = await auth.permissions(user.address, agent.address);
      expect(perm.enabled).to.be.false;
      expect(perm.epoch).to.equal(2n);
    });

    it("rejects unauthorized agent", async function () {
      const { auth, user, agent } = await loadFixture(deployFixture);
      await expect(auth.connect(user).revokeAgent(agent.address)).to.be.revertedWith(
        "Agent not authorized"
      );
    });

    it("invalidates existing approvals", async function () {
      const { auth, authAddress, user, agent, recipient, stub } = await loadFixture(
        deployFixture
      );
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      const pid: string = await auth.connect(user).approvePayment.staticCall(
        agent.address,
        recipient.address,
        ethers.parseEther("50"),
        DURATION,
        now + 86400n
      );
      await auth
        .connect(user)
        .approvePayment(
          agent.address,
          recipient.address,
          ethers.parseEther("50"),
          DURATION,
          now + 86400n
        );

      await auth.connect(user).revokeAgent(agent.address);

      await expect(
        consumeViaStub(
          authAddress,
          stub,
          user.address,
          agent.address,
          recipient.address,
          ethers.parseEther("50"),
          DURATION,
          pid
        )
      ).to.be.revertedWith("Agent revoked");
    });
  });

  describe("updateSpendingLimits", function () {
    it("updates limits and bumps epoch", async function () {
      const { auth, user, agent } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      await expect(
        auth
          .connect(user)
          .updateSpendingLimits(
            agent.address,
            ethers.parseEther("2000"),
            ethers.parseEther("200")
          )
      )
        .to.emit(auth, "SpendingLimitUpdated")
        .withArgs(
          user.address,
          agent.address,
          ethers.parseEther("2000"),
          ethers.parseEther("200"),
          2n
        );

      const perm = await auth.permissions(user.address, agent.address);
      expect(perm.maxTotalSpend).to.equal(ethers.parseEther("2000"));
      expect(perm.maxPerPayment).to.equal(ethers.parseEther("200"));
      expect(perm.epoch).to.equal(2n);
    });

    it("rejects unauthorized", async function () {
      const { auth, user, agent } = await loadFixture(deployFixture);
      await expect(
        auth.connect(user).updateSpendingLimits(agent.address, MAX_TOTAL, MAX_PER_PAY)
      ).to.be.revertedWith("Agent not authorized");
    });

    it("rejects expired permission", async function () {
      const { auth, user, agent } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + 60n);
      await time.increase(61);
      await expect(
        auth.connect(user).updateSpendingLimits(agent.address, MAX_TOTAL, MAX_PER_PAY)
      ).to.be.revertedWith("Permission expired");
    });

    it("rejects below already-spent", async function () {
      const { auth, authAddress, user, agent, recipient, stub } = await loadFixture(
        deployFixture
      );
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      const pid: string = await auth.connect(user).approvePayment.staticCall(
        agent.address,
        recipient.address,
        ethers.parseEther("50"),
        DURATION,
        now + 86400n
      );
      await auth
        .connect(user)
        .approvePayment(
          agent.address,
          recipient.address,
          ethers.parseEther("50"),
          DURATION,
          now + 86400n
        );
      await consumeViaStub(
        authAddress,
        stub,
        user.address,
        agent.address,
        recipient.address,
        ethers.parseEther("50"),
        DURATION,
        pid
      );

      await expect(
        auth
          .connect(user)
          .updateSpendingLimits(
            agent.address,
            ethers.parseEther("40"),
            ethers.parseEther("40")
          )
      ).to.be.revertedWith("Below amount already spent");
    });

    it("invalidates old approvals", async function () {
      const { auth, authAddress, user, agent, recipient, stub } = await loadFixture(
        deployFixture
      );
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      const pid: string = await auth.connect(user).approvePayment.staticCall(
        agent.address,
        recipient.address,
        ethers.parseEther("50"),
        DURATION,
        now + 86400n
      );
      await auth
        .connect(user)
        .approvePayment(
          agent.address,
          recipient.address,
          ethers.parseEther("50"),
          DURATION,
          now + 86400n
        );

      await auth
        .connect(user)
        .updateSpendingLimits(
          agent.address,
          ethers.parseEther("2000"),
          ethers.parseEther("200")
        );

      await expect(
        consumeViaStub(
          authAddress,
          stub,
          user.address,
          agent.address,
          recipient.address,
          ethers.parseEther("50"),
          DURATION,
          pid
        )
      ).to.be.revertedWith("Payment authorization revoked");
    });
  });

  describe("approvePayment", function () {
    it("records approval correctly", async function () {
      const { auth, user, agent, recipient } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));

      const pid: string = await auth.connect(user).approvePayment.staticCall(
        agent.address,
        recipient.address,
        ethers.parseEther("50"),
        DURATION,
        now + 86400n
      );
      await auth
        .connect(user)
        .approvePayment(
          agent.address,
          recipient.address,
          ethers.parseEther("50"),
          DURATION,
          now + 86400n
        );

      expect(await auth.getPaymentOwner(pid)).to.equal(user.address);
      const a = await auth.paymentApprovals(pid);
      expect(a.agent).to.equal(agent.address);
      expect(a.recipient).to.equal(recipient.address);
      expect(a.amount).to.equal(ethers.parseEther("50"));
      expect(a.duration).to.equal(DURATION);
      expect(a.permissionEpoch).to.equal(1n);
      expect(a.exists).to.be.true;
    });

    it("payment IDs are unique", async function () {
      const { auth, user, agent, recipient } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));

      const a: string = await auth.connect(user).approvePayment.staticCall(
        agent.address,
        recipient.address,
        1n,
        DURATION,
        now + 86400n
      );
      await auth
        .connect(user)
        .approvePayment(agent.address, recipient.address, 1n, DURATION, now + 86400n);
      const b: string = await auth.connect(user).approvePayment.staticCall(
        agent.address,
        recipient.address,
        1n,
        DURATION,
        now + 86400n
      );
      await auth
        .connect(user)
        .approvePayment(agent.address, recipient.address, 1n, DURATION, now + 86400n);
      expect(a).to.not.equal(b);
    });

    it("rejects unauthorized", async function () {
      const { auth, user, agent, recipient } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await expect(
        auth
          .connect(user)
          .approvePayment(agent.address, recipient.address, 1n, DURATION, now + 86400n)
      ).to.be.revertedWith("Agent not authorized");
    });

    it("rejects invalid recipient", async function () {
      const { auth, user, agent } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      await expect(
        auth
          .connect(user)
          .approvePayment(agent.address, ethers.ZeroAddress, 1n, DURATION, now + 86400n)
      ).to.be.revertedWith("Invalid recipient");
    });

    it("rejects approval outliving permission", async function () {
      const { auth, user, agent, recipient } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + 60n);
      await expect(
        auth
          .connect(user)
          .approvePayment(agent.address, recipient.address, 1n, DURATION, now + 120n)
      ).to.be.revertedWith("Approval outlives permission");
    });

    it("rejects amount > per-payment", async function () {
      const { auth, user, agent, recipient } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      await expect(
        auth
          .connect(user)
          .approvePayment(
            agent.address,
            recipient.address,
            MAX_PER_PAY + 1n,
            DURATION,
            now + 86400n
          )
      ).to.be.revertedWith("Payment exceeds limit");
    });
  });

  describe("revokePayment", function () {
    it("deletes approval", async function () {
      const { auth, user, agent, recipient } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      const pid: string = await auth.connect(user).approvePayment.staticCall(
        agent.address,
        recipient.address,
        1n,
        DURATION,
        now + 86400n
      );
      await auth
        .connect(user)
        .approvePayment(agent.address, recipient.address, 1n, DURATION, now + 86400n);

      await expect(auth.connect(user).revokePayment(pid))
        .to.emit(auth, "PaymentApprovalRevoked")
        .withArgs(pid, user.address);

      const a = await auth.paymentApprovals(pid);
      expect(a.exists).to.be.false;
      expect(await auth.getPaymentOwner(pid)).to.equal(ethers.ZeroAddress);
    });

    it("rejects unknown payment", async function () {
      const { auth, user } = await loadFixture(deployFixture);
      await expect(auth.connect(user).revokePayment(ethers.id("missing"))).to.be.revertedWith(
        "Approval not found"
      );
    });

    it("rejects non-owner", async function () {
      const { auth, user, agent, recipient } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      const pid: string = await auth.connect(user).approvePayment.staticCall(
        agent.address,
        recipient.address,
        1n,
        DURATION,
        now + 86400n
      );
      await auth
        .connect(user)
        .approvePayment(agent.address, recipient.address, 1n, DURATION, now + 86400n);

      await expect(auth.connect(recipient).revokePayment(pid)).to.be.revertedWith(
        "Not payment owner"
      );
    });
  });

  describe("consumePaymentAuthorization", function () {
    it("only streaming contract", async function () {
      const { auth, user, agent, recipient } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      const pid: string = await auth.connect(user).approvePayment.staticCall(
        agent.address,
        recipient.address,
        1n,
        DURATION,
        now + 86400n
      );
      await auth
        .connect(user)
        .approvePayment(agent.address, recipient.address, 1n, DURATION, now + 86400n);

      await expect(
        auth
          .connect(agent)
          .consumePaymentAuthorization(
            user.address,
            agent.address,
            recipient.address,
            1n,
            DURATION,
            pid
          )
      ).to.be.revertedWith("Only streaming contract");
    });

    it("cannot consume twice", async function () {
      const { auth, authAddress, user, agent, recipient, stub } = await loadFixture(
        deployFixture
      );
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      const pid: string = await auth.connect(user).approvePayment.staticCall(
        agent.address,
        recipient.address,
        1n,
        DURATION,
        now + 86400n
      );
      await auth
        .connect(user)
        .approvePayment(agent.address, recipient.address, 1n, DURATION, now + 86400n);

      await consumeViaStub(
        authAddress,
        stub,
        user.address,
        agent.address,
        recipient.address,
        1n,
        DURATION,
        pid
      );
      await expect(
        consumeViaStub(
          authAddress,
          stub,
          user.address,
          agent.address,
          recipient.address,
          1n,
          DURATION,
          pid
        )
      ).to.be.revertedWith("Payment not approved");
    });

    it("rejects expired approval", async function () {
      const { auth, authAddress, user, agent, recipient, stub } = await loadFixture(
        deployFixture
      );
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      const pid: string = await auth.connect(user).approvePayment.staticCall(
        agent.address,
        recipient.address,
        1n,
        DURATION,
        now + 60n
      );
      await auth
        .connect(user)
        .approvePayment(agent.address, recipient.address, 1n, DURATION, now + 60n);

      await time.increase(61);
      await expect(
        consumeViaStub(
          authAddress,
          stub,
          user.address,
          agent.address,
          recipient.address,
          1n,
          DURATION,
          pid
        )
      ).to.be.revertedWith("Approval expired");
    });
  });

  describe("Views", function () {
    it("remainingAllowance full after authorize", async function () {
      const { auth, user, agent } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      expect(await auth.remainingAllowance(user.address, agent.address)).to.equal(MAX_TOTAL);
    });

    it("remainingAllowance 0 when revoked", async function () {
      const { auth, user, agent } = await loadFixture(deployFixture);
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      await auth.connect(user).revokeAgent(agent.address);
      expect(await auth.remainingAllowance(user.address, agent.address)).to.equal(0n);
    });
  });

  describe("Ownership", function () {
    it("two-step transfer", async function () {
      const { auth, owner, user } = await loadFixture(deployFixture);
      await expect(auth.connect(owner).transferOwnership(user.address))
        .to.emit(auth, "OwnershipTransferStarted")
        .withArgs(owner.address, user.address);
      expect(await auth.pendingOwner()).to.equal(user.address);

      await expect(auth.connect(user).acceptOwnership())
        .to.emit(auth, "OwnershipTransferred")
        .withArgs(owner.address, user.address);

      expect(await auth.owner()).to.equal(user.address);
      expect(await auth.pendingOwner()).to.equal(ethers.ZeroAddress);
    });

    it("rejects zero new owner", async function () {
      const { auth, owner } = await loadFixture(deployFixture);
      await expect(auth.connect(owner).transferOwnership(ethers.ZeroAddress)).to.be.revertedWith(
        "Invalid owner"
      );
    });

    it("only pending owner can accept", async function () {
      const { auth, owner, user, agent } = await loadFixture(deployFixture);
      await auth.connect(owner).transferOwnership(user.address);
      await expect(auth.connect(agent).acceptOwnership()).to.be.revertedWith(
        "Not pending owner"
      );
    });
  });
});
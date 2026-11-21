import { expect } from "chai";
import hre from "hardhat";

const { ethers, networkHelpers } = await hre.network.create();
const { time, loadFixture } = networkHelpers;

describe("StreamingAgent", function () {
  const MAX_TOTAL = ethers.parseEther("1000");
  const MAX_PER_PAY = ethers.parseEther("100");
  const DURATION = 24 * 60 * 60;
  const PERM_EXPIRY = 30 * 24 * 60 * 60;
  const DEPOSIT = ethers.parseEther("100");
  const DRIFT = ethers.parseEther("0.01");

  interface Fixture {
    token: any;
    auth: any;
    streamer: any;
    owner: any;
    user: any;
    agent: any;
    recipient: any;
    other: any;
  }

  async function deployFixture(): Promise<Fixture> {
    const [owner, user, agent, recipient, other] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20");
    const token: any = await Token.deploy();
    await token.waitForDeployment();

    const Auth = await ethers.getContractFactory("AgentAuthorization");
    const auth: any = await Auth.deploy();
    await auth.waitForDeployment();

    const Streamer = await ethers.getContractFactory("StreamingAgent");
    const streamer: any = await Streamer.deploy(
      await token.getAddress(),
      await auth.getAddress()
    );
    await streamer.waitForDeployment();

    await auth.setStreamingContract(await streamer.getAddress());

    await token.mint(user.address, ethers.parseEther("10000"));
    await token
      .connect(user)
      .approve(await streamer.getAddress(), ethers.MaxUint256);

    return { token, auth, streamer, owner, user, agent, recipient, other };
  }

  describe("Constructor / wiring", function () {
    it("isWired true when configured", async function () {
      const { streamer } = await loadFixture(deployFixture);
      expect(await streamer.isWired()).to.be.true;
    });

    it("isWired false when not configured", async function () {
      const Token = await ethers.getContractFactory("MockERC20");
      const token: any = await Token.deploy();
      const Auth = await ethers.getContractFactory("AgentAuthorization");
      const freshAuth: any = await Auth.deploy();
      const Streamer = await ethers.getContractFactory("StreamingAgent");
      const freshStreamer: any = await Streamer.deploy(
        await token.getAddress(),
        await freshAuth.getAddress()
      );
      expect(await freshStreamer.isWired()).to.be.false;
    });

    it("rejects zero token", async function () {
      const Auth = await ethers.getContractFactory("AgentAuthorization");
      const auth: any = await Auth.deploy();
      const Streamer = await ethers.getContractFactory("StreamingAgent");
      await expect(
        Streamer.deploy(ethers.ZeroAddress, await auth.getAddress())
      ).to.be.revertedWith("Invalid token");
    });

    it("rejects zero authorization", async function () {
      const Token = await ethers.getContractFactory("MockERC20");
      const token: any = await Token.deploy();
      const Streamer = await ethers.getContractFactory("StreamingAgent");
      await expect(
        Streamer.deploy(await token.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid authorization");
    });
  });

  describe("createStream", function () {
    it("creates stream and escrows tokens", async function () {
      const { token, streamer, user, recipient } = await loadFixture(
        deployFixture
      );

      const userBefore: bigint = await token.balanceOf(user.address);
      const start: bigint = BigInt(await time.latest());

      await expect(
        streamer.connect(user).createStream(recipient.address, DEPOSIT, DURATION)
      ).to.emit(streamer, "StreamCreated");

      expect(await streamer.nextStreamId()).to.equal(1n);
      expect(await streamer.totalEscrowed()).to.equal(DEPOSIT);
      expect(await token.balanceOf(user.address)).to.equal(userBefore - DEPOSIT);
      expect(await token.balanceOf(await streamer.getAddress())).to.equal(
        DEPOSIT
      );
      expect(await streamer.contractTokenBalance()).to.equal(DEPOSIT);
      expect(await streamer.escrowSolvent()).to.be.true;

      const s = await streamer.streams(0);
      expect(s.sender).to.equal(user.address);
      expect(s.recipient).to.equal(recipient.address);
      expect(s.deposit).to.equal(DEPOSIT);
      expect(s.startTime).to.be.closeTo(start + 1n, 5n);
      expect(s.stopTime).to.equal(s.startTime + BigInt(DURATION));
      expect(s.withdrawn).to.equal(0n);
      expect(s.cancelled).to.be.false;
    });

    it("rejects zero recipient", async function () {
      const { streamer, user } = await loadFixture(deployFixture);
      await expect(
        streamer.connect(user).createStream(ethers.ZeroAddress, DEPOSIT, DURATION)
      ).to.be.revertedWith("Invalid recipient");
    });

    it("rejects self", async function () {
      const { streamer, user } = await loadFixture(deployFixture);
      await expect(
        streamer.connect(user).createStream(user.address, DEPOSIT, DURATION)
      ).to.be.revertedWith("Invalid recipient");
    });

    it("rejects zero deposit", async function () {
      const { streamer, user, recipient } = await loadFixture(deployFixture);
      await expect(
        streamer.connect(user).createStream(recipient.address, 0, DURATION)
      ).to.be.revertedWith("Invalid deposit");
    });

    it("rejects zero duration", async function () {
      const { streamer, user, recipient } = await loadFixture(deployFixture);
      await expect(
        streamer.connect(user).createStream(recipient.address, DEPOSIT, 0)
      ).to.be.revertedWith("Invalid duration");
    });
  });

  describe("Vesting and withdraw", function () {
    it("balanceOf is 0 before start", async function () {
      const { streamer, user, recipient } = await loadFixture(deployFixture);
      await streamer.connect(user).createStream(recipient.address, DEPOSIT, DURATION);
      expect(await streamer.balanceOf(0)).to.be.closeTo(0n, DRIFT);
    });

    it("balanceOf 25% after quarter", async function () {
      const { streamer, user, recipient } = await loadFixture(deployFixture);
      await streamer.connect(user).createStream(recipient.address, DEPOSIT, DURATION);
      await time.increase(DURATION / 4);
      expect(await streamer.balanceOf(0)).to.be.closeTo(DEPOSIT / 4n, DRIFT);
    });

    it("balanceOf 100% after stop", async function () {
      const { streamer, user, recipient } = await loadFixture(deployFixture);
      await streamer.connect(user).createStream(recipient.address, DEPOSIT, DURATION);
      await time.increase(DURATION + 1);
      expect(await streamer.balanceOf(0)).to.equal(DEPOSIT);
    });

    it("withdraw partial then remainder", async function () {
      const { token, streamer, user, recipient } = await loadFixture(
        deployFixture
      );
      await streamer.connect(user).createStream(recipient.address, DEPOSIT, DURATION);

      await time.increase(DURATION / 4);
      await expect(streamer.connect(recipient).withdraw(0))
        .to.emit(streamer, "Withdrawal");
      expect(await token.balanceOf(recipient.address)).to.be.closeTo(
        DEPOSIT / 4n,
        DRIFT
      );

      await time.increase(DURATION / 4);
      await streamer.connect(recipient).withdraw(0);
      expect(await token.balanceOf(recipient.address)).to.be.closeTo(
        DEPOSIT / 2n,
        DRIFT
      );

      await time.increase(DURATION / 2 + 10);
      await streamer.connect(recipient).withdraw(0);
      expect(await token.balanceOf(recipient.address)).to.equal(DEPOSIT);
      expect(await streamer.totalEscrowed()).to.equal(0n);
    });

    it("only recipient can withdraw", async function () {
      const { streamer, user, recipient, other } = await loadFixture(
        deployFixture
      );
      await streamer.connect(user).createStream(recipient.address, DEPOSIT, DURATION);
      await time.increase(DURATION / 2);
      await expect(streamer.connect(other).withdraw(0)).to.be.revertedWith(
        "Only recipient"
      );
    });

    it("withdraw reverts when nothing vested", async function () {
      const { streamer, user, recipient } = await loadFixture(deployFixture);
      await streamer.connect(user).createStream(recipient.address, DEPOSIT, DURATION);
      await time.increase(DURATION + 1);
      await streamer.connect(recipient).withdraw(0);
      await expect(streamer.connect(recipient).withdraw(0)).to.be.revertedWith(
        "No funds available"
      );
    });
  });

  describe("Cancel", function () {
    it("refunds unvested to sender", async function () {
      const { token, streamer, user, recipient } = await loadFixture(
        deployFixture
      );
      const userStart: bigint = await token.balanceOf(user.address);
      await streamer.connect(user).createStream(recipient.address, DEPOSIT, DURATION);

      await time.increase(DURATION / 4);

      await expect(streamer.connect(user).cancelStream(0)).to.emit(
        streamer,
        "StreamCancelled"
      );

      expect(await token.balanceOf(user.address)).to.be.closeTo(
        userStart - DEPOSIT / 4n,
        DRIFT
      );
      expect(await streamer.totalEscrowed()).to.be.closeTo(DEPOSIT / 4n, DRIFT);
      expect(await streamer.balanceOf(0)).to.be.closeTo(DEPOSIT / 4n, DRIFT);
    });

    it("only sender can cancel", async function () {
      const { streamer, user, recipient, other } = await loadFixture(
        deployFixture
      );
      await streamer.connect(user).createStream(recipient.address, DEPOSIT, DURATION);
      await expect(streamer.connect(other).cancelStream(0)).to.be.revertedWith(
        "Only sender"
      );
    });

    it("cannot cancel twice", async function () {
      const { streamer, user, recipient } = await loadFixture(deployFixture);
      await streamer.connect(user).createStream(recipient.address, DEPOSIT, DURATION);
      await streamer.connect(user).cancelStream(0);
      await expect(streamer.connect(user).cancelStream(0)).to.be.revertedWith(
        "Already cancelled"
      );
    });

    it("recipient can still withdraw after cancel", async function () {
      const { token, streamer, user, recipient } = await loadFixture(
        deployFixture
      );
      await streamer.connect(user).createStream(recipient.address, DEPOSIT, DURATION);
      await time.increase(DURATION / 2);
      await streamer.connect(user).cancelStream(0);

      await streamer.connect(recipient).withdraw(0);
      expect(await token.balanceOf(recipient.address)).to.be.closeTo(
        DEPOSIT / 2n,
        DRIFT
      );
    });
  });

  describe("Agent path", function () {
    it("createStreamFor consumes approval", async function () {
      const { token, auth, streamer, user, agent, recipient } = await loadFixture(
        deployFixture
      );
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));

      const pid: string = await auth.connect(user).approvePayment.staticCall(
        agent.address,
        recipient.address,
        DEPOSIT,
        DURATION,
        now + 86400n
      );
      await auth
        .connect(user)
        .approvePayment(
          agent.address,
          recipient.address,
          DEPOSIT,
          DURATION,
          now + 86400n
        );

      await expect(
        streamer
          .connect(agent)
          .createStreamFor(user.address, recipient.address, DEPOSIT, DURATION, pid)
      ).to.emit(streamer, "AgentStreamCreated");

      expect(await token.balanceOf(await streamer.getAddress())).to.equal(DEPOSIT);
      const perm = await auth.permissions(user.address, agent.address);
      expect(perm.spent).to.equal(DEPOSIT);
    });

    it("createStreamFor rejects invalid user", async function () {
      const { auth, streamer, user, agent, recipient } = await loadFixture(
        deployFixture
      );
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      const pid: string = await auth.connect(user).approvePayment.staticCall(
        agent.address,
        recipient.address,
        DEPOSIT,
        DURATION,
        now + 86400n
      );
      await auth
        .connect(user)
        .approvePayment(
          agent.address,
          recipient.address,
          DEPOSIT,
          DURATION,
          now + 86400n
        );

      await expect(
        streamer
          .connect(agent)
          .createStreamFor(ethers.ZeroAddress, recipient.address, DEPOSIT, DURATION, pid)
      ).to.be.revertedWith("Invalid user");
    });

    it("createStreamFor cannot reuse approval", async function () {
      const { auth, streamer, user, agent, recipient } = await loadFixture(
        deployFixture
      );
      const now: bigint = BigInt(await time.latest());
      await auth
        .connect(user)
        .authorizeAgent(agent.address, MAX_TOTAL, MAX_PER_PAY, now + BigInt(PERM_EXPIRY));
      const pid: string = await auth.connect(user).approvePayment.staticCall(
        agent.address,
        recipient.address,
        DEPOSIT,
        DURATION,
        now + 86400n
      );
      await auth
        .connect(user)
        .approvePayment(
          agent.address,
          recipient.address,
          DEPOSIT,
          DURATION,
          now + 86400n
        );

      await streamer
        .connect(agent)
        .createStreamFor(user.address, recipient.address, DEPOSIT, DURATION, pid);

      await expect(
        streamer
          .connect(agent)
          .createStreamFor(user.address, recipient.address, DEPOSIT, DURATION, pid)
      ).to.be.revertedWith("Payment not approved");
    });
  });

  describe("Escrow accounting", function () {
    it("solvent after stream creation", async function () {
      const { streamer, user, recipient } = await loadFixture(deployFixture);
      await streamer.connect(user).createStream(recipient.address, DEPOSIT, DURATION);
      expect(await streamer.escrowSolvent()).to.be.true;
      expect(await streamer.contractTokenBalance()).to.equal(DEPOSIT);
      expect(await streamer.totalEscrowed()).to.equal(DEPOSIT);
    });
  });
});
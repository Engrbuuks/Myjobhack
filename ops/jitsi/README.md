# MyJobHack interview rooms on your own Jitsi server

This sets up a free video server on Oracle Cloud's Always Free tier, so every
interview gets its own private room: no sign in for anyone, no 95 minute limit,
and nobody can enter without a pass that MyJobHack signs for that interview.

MyJobHack is already built for it. The option stays hidden until the steps
below are done and an admin switches it on. Google Meet keeps working
throughout, so nothing is at risk while you set this up.

Time needed: about an hour, most of it waiting for Oracle.

---

## 1. Create the Oracle account

1. Sign up at oracle.com/cloud/free. A card is needed to verify you; the
   Always Free resources used here are not charged.
2. **Choose your home region carefully. It cannot be changed later.** Pick
   the one with the best connection from Nigeria. A European region such as
   London or Frankfurt is often better routed from Lagos than more distant
   ones. If you can, compare with a speed test before choosing.

## 2. Create the server

In the Oracle console: **Compute, Instances, Create instance**.

| Setting | Choose |
|---|---|
| Image | Canonical Ubuntu **24.04** |
| Shape | Ampere, **VM.Standard.A1.Flex**, **2 OCPU, 12 GB memory** (the Always Free allowance) |
| SSH keys | Generate a key pair and **download the private key**. You need it to log in. |

Create it, and note the **public IP address** shown on the instance page.

If Oracle says it is out of capacity for that shape, try again later or in a
different availability domain. This is common and not a problem with your
account.

## 3. Open the ports in Oracle's network

On the instance page, open the **Virtual cloud network**, then **Security
Lists**, then the default list, then **Add Ingress Rules**. Add three rules,
each with source `0.0.0.0/0`:

| Protocol | Port |
|---|---|
| TCP | 80 |
| TCP | 443 |
| UDP | 10000 |

Port 10000 UDP carries the video itself. Without it, people can join a call
but see and hear nothing.

## 4. Keep the address from changing

In **Networking, Reserved public IPs**, reserve the instance's current public
IP. Otherwise it can change after a restart, and the web address would stop
pointing at the server.

## 5. Point a web address at the server

Wherever myjobhack.co's DNS is managed, add a record:

| Type | Name | Value |
|---|---|---|
| A | `meet` | the server's public IP |

This makes **meet.myjobhack.co** the server's address. Wait until it works
before step 6; the HTTPS certificate cannot be issued until it does.

## 6. Install Jitsi

Log in to the server with the key you downloaded:

```
ssh -i your-key.key ubuntu@THE_PUBLIC_IP
```

Then download and run the installer, using your own email address:

```
curl -fsSLO https://raw.githubusercontent.com/Engrbuuks/Myjobhack/main/ops/jitsi/install.sh
DOMAIN=meet.myjobhack.co EMAIL=you@example.com bash install.sh
```

At the end it prints three values. **Copy them somewhere safe.** The secret
works like a password: anyone holding it could create passes into your rooms.

Open https://meet.myjobhack.co in a browser. You should see Jitsi. Trying to
start a meeting there should be refused, because nobody gets in without a pass
from MyJobHack. That refusal is correct.

## 7. Connect MyJobHack

1. In Vercel: **Project, Settings, Environment Variables**. Add the three
   values printed in step 6: `JITSI_DOMAIN`, `JITSI_APP_ID`, `JITSI_APP_SECRET`.
2. Redeploy MyJobHack, so it picks them up.
3. In MyJobHack: **Settings, Video rooms**. Press **Check the server**, then
   **Switch on**.
4. Schedule a test interview to yourself, a few minutes ahead, choosing **Our
   interview room**. Open the candidate link from the invitation on your phone,
   and **Join as interviewer** from the interview desk on your laptop. Check
   you can see and hear each other.
5. When you are happy, you can make it the default in the same settings box.

---

## Keeping it free and running

**Oracle can take back a free server it thinks is idle.** Its rule: over seven
days, processor, network and memory use all stay under 20%. An interview
server is quiet most of the week, so this is a real risk.

The usual way around it is to upgrade the account to **Pay As You Go**. Always
Free resources stay free on a paid account, and the idle rule is written for
free tier accounts. **Check Oracle's current wording before relying on this**,
and set a **budget alert at a small amount** so any charge is noticed at once.

Also:

- **Run a test call before each hiring drive**, the same as step 7.4.
- **Updates.** Every few months, log in and run the installer again with the
  same values. It keeps the secret, so links already sent keep working.

## When something goes wrong

| What you see | Most likely cause |
|---|---|
| The page will not load at all | DNS not pointing at the server yet (step 5), or ports 80 and 443 not open (step 3) |
| Certificate or "not secure" warning | The installer ran before DNS was working. Fix DNS, then run the installer again. |
| People join but no video or sound | Port 10000 UDP not open in Oracle's security list (step 3) |
| "You are not allowed to join" from MyJobHack's link | The secret in Vercel differs from the server's. Compare `JITSI_APP_SECRET` with `JWT_APP_SECRET` in `~/jitsi/.env` on the server. |
| Check the server says it cannot be reached | The server is off or was reclaimed. See "Keeping it free and running". |

**Never change the secret** unless it has leaked. Changing it stops every
interview link already sent from working.

## How the rooms are kept private

- Every interview has its own room, named from a signature over the interview
  id. Room names cannot be guessed.
- The server admits only people holding a pass signed with your secret. Guests
  are switched off.
- A candidate's pass is issued by MyJobHack only from 15 minutes before their
  slot until an hour after it ends, only for their own room, and only in their
  own name.
- Interviewers get their pass from the interview desk while signed in, and
  only for interviews their account may manage.
- The candidate's link carries a signature too, so changing a character in it
  cannot reach someone else's interview.

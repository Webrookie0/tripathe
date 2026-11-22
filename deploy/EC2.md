# Deploy tripathe to EC2

Target: `16.179.88.241`. Repository: https://github.com/Webrookie0/tripathe.

## SSH security group source

The screenshot's `2405:201::/32` rule is an IPv6 range. An SSH connection to the instance's public IPv4 address needs an IPv4 source rule.

On your Mac, obtain the address AWS will see for an IPv4 connection:

```sh
curl -4 https://checkip.amazonaws.com
```

In **Edit inbound rules**, add a rule with **Type: SSH**, **Port: 22**, **Source type: Custom**, and **Source: the returned address followed by `/32`**. Save the rules. HTTP port 80 may remain accessible for the public demo. The instance address `16.179.88.241` is the destination; it is not your Mac's source address.

If your public address changes after switching networks or reconnecting, update the SSH source. An IPv6 address cannot be converted to the public IPv4 address of your connection.

## Connect and install Docker

Use the private key belonging to the key pair selected when launching this instance. `triphoria.pem` and `lyftr-key.pem` exist in Downloads, but this workspace could not verify which belongs to this instance. Do not copy key contents into the repository or chat.

For an Ubuntu instance, after confirming the correct key path:

```sh
chmod 400 ~/Downloads/triphoria.pem
ssh -i ~/Downloads/triphoria.pem ubuntu@16.179.88.241
```

Check the initial SSH host fingerprint against the instance's expected fingerprint before accepting it. Amazon Linux normally uses `ec2-user` rather than `ubuntu`.

The following Docker installation commands are for Ubuntu 24.04:

```sh
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
sudo docker compose version
```

## Deploy from your Mac

After one successful interactive SSH connection and Docker installation, return to your Mac terminal and run from this project directory:

```sh
EC2_SSH_KEY="$HOME/Downloads/triphoria.pem" EC2_USER=ubuntu bash scripts/deploy-ec2.sh
```

The script uploads an explicit list of application files, preserves an existing `.env.hotel`, builds the stack in `~/tripathe`, and checks health and the example filtered response. It requires a known SSH host key and does not silently accept an unknown one. Set `EC2_USER`, `EC2_SSH_KEY`, or `EC2_HOST` when their defaults do not match your instance.

The EC2 Compose overlay adds Nginx on port 80. API port 3000, Redis, and Temporal remain bound to loopback on the instance. The public demo should then be accessible at:

```text
http://16.179.88.241/health
http://16.179.88.241/api/hotels?city=delhi
http://16.179.88.241/api/hotels?city=delhi&minPrice=5000&maxPrice=6000
```

These are intended URLs, not verified live endpoints. Port 443 will not serve HTTPS until a domain/certificate and TLS proxy configuration are added. This stack uses the Temporal development server for the coursework demo.

## Publish the whole project to GitHub

The repository initialization snippet should commit the application, not just README. Preserve the detailed README instead of replacing it with a one-line title.

From a terminal with GitHub access, in the project directory:

```sh
git init
git add .gitignore .dockerignore .env.hotel.example .github README.md PLAN.md VERIFICATION.md \
  package.json tsconfig.json tsconfig.build.json eslint.config.mjs Dockerfile \
  compose.yaml compose.ec2.yaml src tests scripts postman deploy
git commit -m "Build hotel offer orchestrator with Temporal and Redis"
git branch -M main
git remote add origin https://github.com/Webrookie0/tripathe.git
git push -u origin main
```

Once dependencies can be installed, generate and commit `package-lock.json` and switch installs to `npm ci`. If the remote repository already has commits, fetch and integrate those commits before pushing; do not force-push over them.

The implementation workspace could not write its protected `.git` directory, open outbound SSH connections, or resolve external hosts, so live publication and deployment must run from a terminal or environment with those capabilities.

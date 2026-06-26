Step 1 — Confirm everything is on master and pushed

git status
You should see nothing to commit, working tree clean and up to date with 'origin/master'. That means master is already saved both locally and on GitHub. (We confirmed this earlier — you have nothing pending.)

If for any reason it shows uncommitted changes later:

git add .
git commit -m "feat: add order-service"
git push origin master

---------------------------------
Step 2 — Create the dev branch

git branch dev
What this does: Creates a new branch called dev that points to the exact same commit master is on. It does NOT switch you to it — you're still on master. Think of it as making a copy of the current bookmark.

---------------------------------

Step 3 — Switch to the dev branch

git checkout dev
What this does: Moves you onto the dev branch. Now any commits you make go to dev, leaving master untouched and stable.

(You can combine Steps 2 and 3 into one command: git checkout -b dev — the -b means "create and switch.")

---------------------------------

Step 4 — Push dev to GitHub

git push -u origin dev
What this does:

push — uploads the branch to GitHub
origin — the remote name (your GitHub repo)
dev — the branch to push
-u — short for --set-upstream. It links your local dev to the remote dev. After doing this once, you can just type git push and git pull on this branch with no extra arguments.

---------------------------------

Step 5 — Verify

git branch -a
You should see:


* dev               ← the * means you're currently on dev
  master
  remotes/origin/dev
  remotes/origin/master
The workflow from here on

master  ← stable, working code (don't touch directly)
  │
  └── dev  ← you do all new work here

When dev work is tested and solid:
  git checkout master
  git merge dev
  git push origin master
Why this matters: master always stays in a working state. You experiment freely on dev. If you break something on dev, master is safe. This is the foundation of professional git workflow — and it becomes essential in Phase 13 when CI/CD runs tests on branches before merging.


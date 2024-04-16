const axios = require("axios");
const human = require("humanparser");
const licensesAvail = require("./public/assets/data/licenses.json");
const yaml = require("js-yaml");
const { split } = require("postcss/lib/list");
/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
module.exports = (app) => {
  // Opens a PR every time someone installs your app for the first time
  // On adding the app to a repo
  // TODO: If issue is closed without a license or citation, don't create the issue again
  app.on("installation.created", async (context) => {
    const owner = context.payload.installation.account.login;

    // shows all repos you've installed the app on
    for (const repository of context.payload.repositories) {
      const repo = repository.name;

      let license = await checkForLicense(context, owner, repo);
      let citation = await checkForCitation(context, owner, repo);

      if (!license) {
        console.log("No license file found");
        // If issue has been created, create one
        const title = "No license file found";
        const body = `To make your software reusable a license file is expected at the root level of your repository, as recommended in the [FAIR-BioRS Guidelines](https://fair-biors.org). No such file was found. It is important to choose your license early since it will affect your software's dependencies. If you would like me to add a license file for you, please reply here with the identifier of the license you would like from the [SPDX License List](https://spdx.org/licenses/)  (e.g., comment “@codefair-app MIT” for the MIT license). I will then create a new branch with the corresponding license file and open a pull request for you to review and approve. You can also add a license file yourself and I will close this issue when I detect it on the main branch. If you need help with choosing a license, you can check out https://choosealicense.com.`;
        let verify = await verifyFirstIssue(context, owner, repo, title);
        if (!verify) {
          await createIssue(context, owner, repo, title, body);
        }
      } else {
        // License was found, close the issue if one was created
        const issue = await context.octokit.issues.listForRepo({
          owner,
          repo: repo,
          state: "open",
          creator: "codefair-app[bot]",
          title: "No license file found",
        });

        if (issue.data.length > 0) {
          // If title issue is found, close the issue
          for (let i = 0; i < issue.data.length; i++) {
            if (issue.data[i].title === "No license file found") {
              await context.octokit.issues.update({
                repo,
                owner,
                issue_number: issue.data[i].number,
                state: "closed",
              });
            }
          }
        }
      }

      if (!citation && license) {
        // License was found but no citation file was found
        const title = "No citation file found";
        const body = `No CITATION.cff file was found at the root of your repository. The [FAIR-BioRS guidelines](https://fair-biors.org/docs/guidelines) suggests to include that file for providing metadata about your software and make it FAIR.
          If you would like me to generate a CITATION.cff file for you, please reply with "@codefair-app Yes". I will gather the information required in the CITATION.cff that I can find automatically from your repository and include that information in my reply for your review and edit. You can also ass a CITATION.cff file yourself and I will close this issue when I detect it on the main branch.
          `;
        let verify = await verifyFirstIssue(context, owner, repo, title);
        if (!verify) {
          await createIssue(context, owner, repo, title, body);
        }
      }
    }
  });

  app.on("installation_repositories.added", async (context) => {
    // Event for when github app is alredy installed but a new repository is added
    const owner = context.payload.installation.account.login;

    for (const repository of context.payload.repositories_added) {
      // Loop through the added respotories
      const repo = repository.name;
      const license = await checkForLicense(context, owner, repo);
      const citation = await checkForCitation(context, owner, repo);

      if (!license) {
        // No license was found, make an issue if one was never made before
        // If the issue was close, don't make another
        console.log("No license file found");
        const title = "No license file found";
        const body = `To make your software reusable a license file is expected at the root level of your repository, as recommended in the [FAIR-BioRS Guidelines](https://fair-biors.org). No such file was found. It is important to choose your license early since it will affect your software's dependencies. If you would like me to add a license file for you, please reply here with the identifier of the license you would like from the [SPDX License List](https://spdx.org/licenses/)  (e.g., comment “@codefair-app MIT” for the MIT license). I will then create a new branch with the corresponding license file and open a pull request for you to review and approve. You can also add a license file yourself and I will close this issue when I detect it on the main branch. If you need help with choosing a license, you can check out https://choosealicense.com.`;
        let verify = await verifyFirstIssue(context, owner, repo, title);
        if (!verify) {
          await createIssue(context, owner, repo, title, body);
        }
      } else {
        // Check if issue is open and close it
        const issue = await context.octokit.issues.listForRepo({
          owner,
          repo: repo,
          state: "open",
          creator: "codefair-app[bot]",
          title: "No license file found",
        });

        if (issue.data.length > 0) {
          // If title if issue is found, close the issue
          for (let i = 0; i < issue.data.length; i++) {
            if (issue.data[i].title === "No license file found") {
              await context.octokit.issues.update({
                repo,
                owner,
                issue_number: issue.data[i].number,
                state: "closed",
              });
            }
          }
        }
      }

      if (!citation && license) {
        const title = "No citation file found";
        const body = `No CITATION.cff file was found at the root of your repository. The [FAIR-BioRS guidelines](https://fair-biors.org/docs/guidelines) suggests to include that file for providing metadata about your software and make it FAIR.
          If you would like me to generate a CITATION.cff file for you, please reply with "@codefair-app Yes". I will gather the information required in the CITATION.cff that I can find automatically from your repository and include that information in my reply for your review and edit. You can also ass a CITATION.cff file yourself and I will close this issue when I detect it on the main branch.
          `;
        let verify = await verifyFirstIssue(context, owner, repo, title);
        if (!verify) {
          await createIssue(context, owner, repo, title, body);
        }
      }
    }
  });

  app.on("push", async (context) => {
    // Event for when a push is made to the repository (listens to all branches)
    const owner = context.payload.repository.owner.login;
    const repo = context.payload.repository.name;

    // Check if push is going to the default branch
    let default_branch;
    try {
      // Get the default branch of the repository
      default_branch = await context.octokit.repos.getBranch({
        owner,
        repo,
        branch: context.payload.repository.default_branch,
      });
    } catch (error) {
      console.log("Error getting default branch");
      console.log(error);
      return;
    }

    console.log("DEFAULT BELOW");
    console.log(default_branch.data.name);
    // If push is not going to the default branch don't do anything
    if (context.payload.ref != `refs/heads/${default_branch.data.name}`) {
      console.log("Not pushing to default branch");
      return;
    }

    // Grab the commits being pushed
    const { commits } = context.payload;

    // Check if there is a license file in the repository
    let license = await checkForLicense(context, owner, repo);
    let citation = await checkForCitation(context, owner, repo);

    // Check if any of the commits added a LICENSE file
    if (commits.length > 0) {
      let licenseBeingPushed = false;
      let citationBeingPushed = false;
      // Verify there is no LICENSE file in the commits
      for (let i = 0; i < commits.length; i++) {
        if (commits[i].added.includes("LICENSE")) {
          console.log("LICENSE file added");
          licenseBeingPushed = true;
          continue;
        }
        if (commits[i].added.includes("CITATION.cff")) {
          console.log("CITATION.cff file added");
          citationBeingPushed = true;
          continue;
        }
        if (licenseBeingPushed) {
          license = true;
        }
        if (citationBeingPushed) {
          citation = true;
        }
      }
    }

    if (!license) {
      console.log("No license file found (push)");
      // If issue has been created, create one
      const title = "No license file found";
      const body = `To make your software reusable a license file is expected at the root level of your repository, as recommended in the [FAIR-BioRS Guidelines](https://fair-biors.org). No such file was found. It is important to choose your license early since it will affect your software's dependencies. If you would like me to add a license file for you, please reply here with the identifier of the license you would like from the [SPDX License List](https://spdx.org/licenses/)  (e.g., comment “@codefair-app MIT” for the MIT license). I will then create a new branch with the corresponding license file and open a pull request for you to review and approve. You can also add a license file yourself and I will close this issue when I detect it on the main branch. If you need help with choosing a license, you can check out https://choosealicense.com.`;
      let verify = await verifyFirstIssue(context, owner, repo, title);
      if (!verify) {
        await createIssue(context, owner, repo, title, body);
      }
    } else {
      // License was found, close the issue if one was created
      const issue = await context.octokit.issues.listForRepo({
        owner,
        repo: repo,
        state: "open",
        creator: "codefair-app[bot]",
        title: "No license file found",
      });

      if (issue.data.length > 0) {
        // If title if issue is found, close the issue
        for (let i = 0; i < issue.data.length; i++) {
          if (issue.data[i].title === "No license file found") {
            await context.octokit.issues.update({
              repo,
              owner,
              issue_number: issue.data[i].number,
              state: "closed",
            });
          }
        }
      }
    }

    if (!citation && license) {
      const title = "No citation file found";
      const body = `No CITATION.cff file was found at the root of your repository. The [FAIR-BioRS guidelines](https://fair-biors.org/docs/guidelines) suggests to include that file for providing metadata about your software and make it FAIR.
      If you would like me to generate a CITATION.cff file for you, please reply with "@codefair-app Yes". I will gather the information required in the CITATION.cff that I can find automatically from your repository and include that information in my reply for your review and edit. You can also ass a CITATION.cff file yourself and I will close this issue when I detect it on the main branch.
      `;
      let verify = await verifyFirstIssue(context, owner, repo, title);
      if (!verify) {
        await createIssue(context, owner, repo, title, body);
      }
    } else {
      // Check if issue is open and close it
      const issue = await context.octokit.issues.listForRepo({
        owner,
        repo: repo,
        state: "open",
        creator: "codefair-app[bot]",
        title: "No citation file found",
      });

      if (issue.data.length > 0) {
        // If title if issue is found, close the issue
        for (let i = 0; i < issue.data.length; i++) {
          if (issue.data[i].title === "No citation file found") {
            await context.octokit.issues.update({
              repo,
              owner,
              issue_number: issue.data[i].number,
              state: "closed",
            });
          }
        }
      }
    }
  });

  app.on("issue_comment.created", async (context) => {
    const owner = context.payload.repository.owner.login;
    const repo = context.payload.repository.name;
    const { comment } = context.payload;
    // console.log(comment.body);
    console.log("should all be true above to move forward");

    if (
      context.payload.issue.title === "No license file found" &&
      ["MEMBER", "OWNER"].includes(comment.author_association) &&
      comment.body.includes("codefair-app")
    ) {
      // Check the comment to see if the user has replied with a license
      const userComment = comment.body;
      const splitComment = userComment.split(" ");
      const selection = splitComment[splitComment.indexOf("@codefair-app") + 1];

      console.log("License user responded with: " + selection);

      // Create a new file with the license on the new branch and open pull request
      await createLicense(context, owner, repo, selection);
    }

    if (
      context.payload.issue.title === "No citation file found" &&
      ["MEMBER", "OWNER"].includes(comment.author_association) &&
      comment.body.includes("codefair-app")
    ) {
      const userComment = comment.body;

      if (userComment.includes("Yes")) {
        // Gather the information for the CITATION.cff file
        await gatherCitationInfo(context, owner, repo);
      }

      if (userComment.includes("UPDATE")) {
        // Create a new file with the CITATION.cff file
        // Get the yaml context from the userComment
        let start = userComment.indexOf("- ");
        let end = userComment.indexOf("@codefair-app UPDATE");
        let yamlContext = userComment.substring(start, end);
        // Load the input string into a JavaScript object
        // Split yamlContext into an array of strings based on hyphen
        let splitContext = yamlContext.split("\r\n").map(item => item.trim());
        console.log(splitContext);

        // await createCitationFile(context, owner, repo, yaml.dump(mergedObject));
        // console.log(userComment);
      }

      if (userComment.includes("CONTINUE")) {
        // Create a new file with the yaml context created by the bot
        // Get all comments on the issue
        const comments = await context.octokit.issues.listComments({
          repo,
          owner,
          issue_number: context.payload.issue.number,
        });
        // console.log(comments.data);

        // Get the yaml context from the bot's comment
        let yamlContext;
        comments.data.map((comment) => {
          // TODO: WHEN TRANSFERING TO PRODUCTION, CHANGE THE USER TO THE CODEFAIR'S BOT NAME
          if (
            comment.performed_via_github_app != null &&
            comment.user.login === "codefair-test[bot]" &&
            comment.body.includes("Here is the information")
          ) {
            let start = comment.body.indexOf("```yaml") + 7;
            let end = comment.body.indexOf("```", start);
            yamlContext = comment.body.substring(start, end);
          }
        });
        await createCitationFile(context, owner, repo, yamlContext.trim());
      }
    }
  });
};

async function getDefaultBranch(context, owner, repo) {
  let default_branch;
  let default_branch_name;

  try {
    default_branch = await context.octokit.repos.getBranch({
      owner,
      repo,
      branch: context.payload.repository.default_branch,
    });
    default_branch_name = default_branch.data.name;
    return default_branch;
  } catch (error) {
    console.log("Error getting the default branch");
    console.log(error);
    return;
  }
}

async function verifyFirstIssue(context, owner, repo, title) {
  // If there is an issue that has been created by the bot, (either opened or closed) don't create another issue
  const issues = await context.octokit.issues.listForRepo({
    owner,
    repo,
    creator: "codefair-app[bot]",
    state: "all",
  });

  console.log("VERIFY FIRST ISSUE (OPEN OR CLOSE)");
  console.log(issues.data);

  if (issues.data.length > 0) {
    // iterate through issues to see if there is an issue with the same title
    let no_issue = false;
    for (let i = 0; i < issues.data.length; i++) {
      if (issues.data[i].title === title) {
        console.log("Issue already exists, will not recreate");
        no_issue = true;
        break;
      }
    }

    if (!no_issue) {
      return false;
    } else {
      return true;
    }
  }
}

async function checkForLicense(context, owner, repo) {
  console.log("checking for license");
  try {
    await context.octokit.rest.licenses.getForRepo({
      owner,
      repo,
    });

    console.log("license found!");
    return true;
  } catch (error) {
    console.log("no license found");
    // Errors when no License is found in the repo
    return false;
  }
}

async function checkForCitation(context, owner, repo) {
  try {
    await context.octokit.rest.repos.getContent({
      owner,
      repo,
      path: "CITATION.cff",
    });

    return true;
  } catch (error) {
    return false;
  }
}

async function createIssue(context, owner, repo, title, body) {
  // If issue has been created, create one
  console.log("gathering issues");
  const issue = await context.octokit.issues.listForRepo({
    owner,
    repo: repo,
    state: "open",
    creator: "codefair-app[bot]",
    title: title,
  });

  console.log("ISSUE DATA");
  console.log(issue.data);

  if (issue.data.length > 0) {
    // iterate through issues to see if there is an issue with the same title
    let no_issue = false;
    for (let i = 0; i < issue.data.length; i++) {
      if (issue.data[i].title === title) {
        no_issue = true;
        break;
      }
    }

    if (!no_issue) {
      console.log("Creating an issue since no open issue was found");
      // Issue has not been created so we create one
      await context.octokit.issues.create({
        repo,
        owner,
        title: title,
        body: body,
      });
    }
  }

  if (issue.data.length === 0) {
    // Issue has not been created so we create one
    await context.octokit.issues.create({
      repo,
      owner,
      title: title,
      body: body,
    });
  }
}

// TODO: DELETE IF NOT NEEDED
async function gatherAuthorInformation(yamlContext) {
  let parsedYaml = yamlContext.indexOf("- authors:\r\n") + "- authors\r\n".length;
  let parsedYaml2 = yamlContext.indexOf("- cff-version:")
  let content = yamlContext.substring(parsedYaml, parsedYaml2).trim();
  // Split based on hyphen
  let splitContent = content.split("-").map(item => item.replace(/\r\n/g, "").trim());
  // Remove first element
  splitContent.shift();
  // console.log(splitContent)
  // Create an array of each element in splitContent based on the commas
  let authors = splitContent.map(item => item.split(","));
  // trim each item in authors
  authors = authors.map(item => item.map(author => author.trim()));
  // console.log(authors);
  let authorsObj = [];
  for (let i = 0; i < authors.length; i++) {
    let authorObj = {};
    for (let j = 0; j < authors[i].length; j++) {
      let splitAuthor = authors[i][j].split(":");
      if (splitAuthor[0].trim().toLowerCase() === "email") {
        authorObj[splitAuthor[0].trim().toLowerCase()] = splitAuthor[1].trim();
      }
      if (splitAuthor[0].trim().toLowerCase() === "name") {
        let parsedName = human.parseName(splitAuthor[1].trim());
        if (parsedName.firstName) {
          authorObj["given-names"] = parsedName.firstName;
        }
        if (parsedName.lastName) {
          authorObj["family-names"] = parsedName.lastName;
        }
      }
      if (splitAuthor[0].trim().toLowerCase() === "affiliation") {
        authorObj[splitAuthor[0].trim().toLowerCase()] = splitAuthor[1].trim();
      }
    }
    authorsObj.push(authorObj);
  }
  console.log(authorsObj);
  return authorsObj;
}

async function gatherCitationAuthors(context, owner, repo) {
  // Get the list of contributors from the repo
  const contributors = await context.octokit.repos.listContributors({
    repo,
    owner,
  });


  // Get user information for each contributors
  let userInfo = await Promise.all(
    contributors.data.map(async (contributor) => {
      return await context.octokit.users.getByUsername({
        username: contributor.login,
      });
    })
  );


  let parsedAuthors = [];
  if (userInfo.length > 0) {
    userInfo.map((author) => {
      if (author.data.type === "Bot") {
        return;
      }

      let authorObj = {};
      const parsedNames = human.parseName(author.data.name);
      if (author.data.company) {
        authorObj["affiliation"] = author.data.company;
      }

      if (parsedNames.firstName) {
        authorObj["given-names"] = parsedNames.firstName;
      }
      if (parsedNames.lastName) {
        authorObj["family-names"] = parsedNames.lastName;
      }
      if (author.data.email) {
        authorObj["email"] = author.data.email;
      }
      parsedAuthors.push(authorObj);
    });
  }

  return parsedAuthors;
}

async function gatherLanguagesUsed(context, owner, repo) {
  // Get the programming languages used in the repo
  let languages = await context.octokit.repos.listLanguages({
    repo,
    owner,
  });

  // Parse the data for languages used
  let languagesUsed = [];
  if (languages != {}) {
    languagesUsed = Object.keys(languages.data);
  }

  return languagesUsed;
}

async function createLicense(context, owner, repo, license) {
  // Verify there is no PR open already for the LICENSE file
  const openPR = await context.octokit.pulls.list({
    repo,
    owner,
    state: "open",
  });

  let prExists = false;
  openPR.data.map((pr) => {
    if (pr.title === "feat: ✨ LICENSE file added") {
      prExists = true;
    }
  });

  if (prExists) {
    await context.octokit.issues.createComment({
      repo,
      owner,
      issue_number: context.payload.issue.number,
      body: `A pull request for the LICENSE file already exists here: ${openPR.data[0].html_url}`,
    });

    // // comment on pull request to resolve issue
    // await context.octokit.issues.createComment({
    //   repo,
    //   owner,
    //   issue_number: openPR.data[0].number,
    //   body: `Resolves #${context.payload.issue.number}`,
    // });
    return;
  }

  // Create a new file with the license parameter (use axios to get the license from the licenses.json file)
  // Create a new branch with the license file and open a PR
  const licenseRequest = licensesAvail.find(
    (item) => item.licenseId === license
  );
  if (licenseRequest) {
    try {
      const response = await axios.get(licenseRequest.detailsUrl);
      const response_data = response.data;

      // Create a new file
      const branch = `license-${Math.floor(Math.random() * 9999)}`;

      let default_branch;
      let default_branch_name;
      try {
        default_branch = await context.octokit.repos.getBranch({
          owner,
          repo,
          branch: context.payload.repository.default_branch,
        });
        default_branch_name = default_branch.data.name;
      } catch (error) {
        console.log("Error getting default branch");
        console.log(error);
        return;
      }

      // Create a new branch base off the default branch
      console.log(default_branch);
      console.log("Creating branch");
      await context.octokit.git.createRef({
        repo,
        owner,
        ref: `refs/heads/${branch}`,
        sha: default_branch.data.commit.sha,
      });

      // Create a new file
      console.log("Creating file");
      await context.octokit.repos.createOrUpdateFileContents({
        repo,
        owner,
        path: "LICENSE",
        message: `feat: ✨ add LICENSE file with ${license} license terms`,
        content: Buffer.from(response_data.licenseText).toString("base64"),
        branch,
      });

      // Create a PR from that branch with the commit of our added file
      console.log("Creating PR");
      await context.octokit.pulls.create({
        repo,
        owner,
        title: "feat: ✨ LICENSE file added",
        head: branch,
        base: default_branch_name,
        body: `Resolves #${context.payload.issue.number}`,
        maintainer_can_modify: true, //Allows maintainers to edit your app's PR
      });

      // Comment on issue to notify user that license has been added
      console.log("Commenting on issue");
      await context.octokit.issues.createComment({
        repo,
        owner,
        issue_number: context.payload.issue.number,
        body: `A LICENSE file with ${license} license terms has been added to a new branch and a pull request is awaiting approval. I will close this issue automatically once the pull request is approved.`,
      });
    } catch (error) {
      console.log("Error fetching license file");
      console.log(error);
      return;
    }
  } else {
    // License not found, comment on issue to notify user
    console.log("License not found");
    await context.octokit.issues.createComment({
      repo,
      owner,
      issue_number: context.payload.issue.number,
      body: `The license identifier “${license}” was not found in the SPDX License List. Please reply with a valid license identifier.`,
    });
  }
}

async function createCitationFile(context, owner, repo, citationText) {
  // Here we take the citation text passed as a parameter
  // It could from probot's initial gathering or an updated version from the user

  // Create a new branch
  const branch = `citation-${Math.floor(Math.random() * 9999)}`;

  // Get the default branch of the repo
  let default_branch = await getDefaultBranch(context, owner, repo);
  console.log(default_branch);
  let default_branch_name = default_branch.data.name;

  // Create a new branch based off the default branch
  await context.octokit.git.createRef({
    repo,
    owner,
    ref: `refs/heads/${branch}`,
    sha: default_branch.data.commit.sha,
  });

  // Create a new file
  await context.octokit.repos.createOrUpdateFileContents({
    repo,
    owner,
    path: "CITATION.cff",
    message: `feat: ✨ add CITATION.cff file`,
    content: Buffer.from(citationText).toString("base64"),
    branch,
  });

  // Create a PR with the branch
  await context.octokit.pulls.create({
    repo,
    owner,
    title: "feat: ✨ CITATION.cff create for repo",
    head: branch,
    base: default_branch_name,
    body: `Resolves #${context.payload.issue.number}`,
    maintainer_can_modify: true,
  });

  // Comment on issue to notify user that citation has been added
  await context.octokit.issues.createComment({
    repo,
    owner,
    issue_number: context.payload.issue.number,
    body: `A CITATION.cff file has been added to a new branch and a pull request is awaiting approval. I will close this issue automatically once the pull request is approved.`,
  });
}

async function getDOI(context, owner, repoName) {
  try {
    const readme = await context.octokit.repos.getContent({
      owner,
      repo: repoName
    });

    const readmeContent = Buffer.from(readme.data.content, 'base64').toString('utf-8');
    const doiRegex = /10.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
    const doi = doiRegex.exec(readmeContent);

    if (doi) {
      return [true, doi[0]];
    }
  } catch(error) {
    return [false, ""];
  }
} 

async function gatherCitationInfo(context, owner, repo) {
  // Verify there is no PR open already for the CITATION.cff file
  const openPR = await context.octokit.pulls.list({
    repo,
    owner,
    state: "open",
  });

  let prExists = false;
  openPR.data.map((pr) => {
    if (pr.title === "feat: ✨ CITATION.cff created for repo") {
      prExists = true;
    }
  });

  if (prExists) {
    await context.octokit.issues.createComment({
      repo,
      owner,
      issue_number: context.payload.issue.number,
      body: `A PR for the CITATION.cff file already exists here: ${openPR.data[0].html_url}`,
    });
    return;
  }

  // Get the release data of the repo
  let releases = await context.octokit.repos.listReleases({
    repo,
    owner,
  });

  // Get the metadata of the repo
  let repoData = await context.octokit.repos.get({
    repo,
    owner,
  });

  console.log(repoData.data);

  // Get authors of repo
  let parsedAuthors = await gatherCitationAuthors(context, owner, repo);
  // Get DOI of repo (if it exists)
  let doi = await getDOI(context, owner, repo);
  // Get the repo description
  let abstract = repoData.data.description;
  // Get the license of the repo
  let license_name = repoData.data.license;

  // date released is dependent on whether the repo has a release data (if not, use the created date)
  let date_released;
  if (repoData.data.released_at) {
    date_released = repoData.data.released_at;
  } else {
    // The date needs to be in this pattern: 
    date_released = new Date().toISOString().split('T')[0];
  }

  // Get the homepage of the repo
  let url;
  if (repoData.data.homepage != null) {
    url = repoData.data.homepage;
  }

  // Get the keywords of the repo
  let keywords = [];
  if (repoData.data.topics != null && repoData.data.topics.length > 0) {
    console.log(repoData.data.topics)
    keywords = repoData.data.topics;
    console.log(keywords)
  }

  // Begin creating json for CITATION.cff file
  let citation_obj = {
    "cff-version": "1.2.0",
    message: "If you use this software, please cite it as below.",
    type: "software",
    identifiers: [
      {
        type: "doi",
        description: "DOI for this software's record on Zenodo.",
      },
    ],
    "repository-code": repoData.data.html_url,
    title: repoData.data.name,
  };

  if (doi[0]) {
    citation_obj["identifiers"][0]["value"] = doi[1];
  } else {
    citation_obj["identifiers"][0]["value"] = "";
  }

  if (parsedAuthors.length > 0) {
    citation_obj["authors"] = parsedAuthors;
  }

  if (license_name != null) {
    citation_obj["license"] = license_name["spdx_id"];
  }

  if (abstract != null) {
    citation_obj["abstract"] = abstract;
  } else {
    citation_obj["abstract"] = "";
  }

  if (keywords.length > 0) {
    citation_obj["keywords"] = keywords;
  }

  if (url != null && url != "") {
    citation_obj["url"] = url;
  } else {
    citation_obj["url"] = repoData.data.html_url;
  }

  if (date_released != null && date_released != "") {
    citation_obj["date-released"] = date_released;
  } else {
    citation_obj["date-released"] = ""
  }

  // sort keys alphabetically
  citation_obj = Object.keys(citation_obj)
    .sort()
    .reduce((acc, key) => {
      acc[key] = citation_obj[key];
      return acc;
    }, {});

  let citation_template = yaml.dump(citation_obj);

  // Comment the yaml info we gathered and mention if they want us to create the file as if
  // If they want to add extra info, copy the content and add accordingly then paste back in as comment
  await context.octokit.issues.createComment({
    repo,
    owner,
    issue_number: context.payload.issue.number,
    body:
      "```yaml\n" +
      citation_template +
      "\n```" +
      `\n\nHere is the information I was able to gather from this repo. If you would like to add more please copy the context and update accordingly and reply with "@codefair-app UPDATE". If you would like me to create a PR as is please reply with "@codefair-app CONTINUE".`,
  });

  // Comment information on the issue
  // await context.octokit.issues.createComment({
  //   repo,
  //   owner,
  //   issue_number: context.payload.issue.number,
  //   body: `Creating a CITATION.cff file for the repo with the following contributors: ${contributors.data
  //     .map((contributor) => contributor.login)
  //     .join(", ")}\n\n
  //   user info: ${JSON.stringify(userInfo)}\n\n
  //   all other metadata: ${JSON.stringify(repoData.data)}\n\n
  //   all parsedAuthors: ${JSON.stringify(parsedAuthors)}\n\n
  //   release data: ${JSON.stringify(releases.data)}\n\n
  //   languages used: ${JSON.stringify(languages.data)}\n\n
  //   `,
  // });
}

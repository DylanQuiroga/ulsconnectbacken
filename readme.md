# Express Example Project Deployment on Leapcell

## Project Overview

This is an example project based on the Express framework. Its main purpose is to educate users on how to deploy applications on the Leapcell platform. The project functions as a simple blog application, which reads blog post content from Markdown files, converts it into HTML, and displays it on web pages.

## Project Structure

The directory structure of the project is as follows:

```
.
├── app.js                // The main entry file of the project, containing the configuration and routes of the Express application
├── content               // Directory to store Markdown-formatted blog posts
│   ├── first-review.md
│   └── second.md
├── images                // Directory to store image files related to the project
│   └── logo.png
├── package.json          // File for managing project dependencies
└── views                 // Directory to store EJS view files
    ├── index.ejs         // View file for the home page
    └── single.ejs        // View file for a single blog post
```

## Running the Project Locally

Before running the project locally, make sure you have installed Node.js and npm (Node Package Manager).

1. **Clone the Project**: Clone the project repository to your local machine.

```bash
git clone https://github.com/leapcell/express-blog
```

2. **Install Dependencies**: Navigate to the project directory and install the required dependencies.

```bash
cd express-blog
npm install
```

3. **Start the Project**: Run the following command to start the Express application.

```bash
node app.js
```

Once the application starts, you can access it in your browser at `http://localhost:3000` to view how the project works.

## Deployment on Leapcell

1. **Register a Leapcell Account**: If you don't have a Leapcell account yet, please register on the official Leapcell website.
2. **Connect the Code Repository**: On the Leapcell platform, select to connect your code repository (such as GitHub, GitLab, etc.) and authorize Leapcell to access your repository.
3. **Configure Deployment**: On the Leapcell platform, create a new deployment project, and select your code repository and branch (in this project, we use the `main` branch). Configure the project's build and deployment commands (usually, for this project, you don't need additional configuration, and the default `npm install` and `node app.js` commands can be used).
4. **Trigger Deployment**: After saving the configuration, Leapcell will automatically detect changes in your code repository. When you merge your changes into the `main` branch, Leapcell will automatically trigger the deployment process.

## Try Making Changes and Merging into the Main Branch

1. **Modify Markdown Posts**: Open the Markdown files in the `content` directory (such as `first-review.md` or `second.md`), and modify the content, title, tags, or other information of the blog posts.
2. **Commit the Changes**: In the local project directory, use Git commands to commit your changes.

```bash
git add content/[The Name of the Markdown File You Modified]
git commit -m "Modify the content of the blog post"
```

3. **Merge into the Main Branch**: Merge your changes into the `main` branch (if necessary, you may need to pull the latest code from the `main` branch first).

```bash
git checkout main
git pull origin main
git merge [Your Branch Name]
git push origin main
```

4. **Check the Deployment Result**: Wait for Leapcell to complete the automatic deployment, then visit the URL of your deployed project on Leapcell to check the effect of the modified blog posts.

## Notes

1. **Troubleshooting Deployment Failures**: If there are issues during the deployment process, please check the deployment logs on the Leapcell platform to identify and fix the error.

We hope this tutorial helps you successfully deploy and use this project on Leapcell! If you have any questions, feel free to contact us.

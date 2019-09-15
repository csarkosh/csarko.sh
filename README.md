# [csarko.sh](https://csarko.sh) &middot; [![CircleCI](https://img.shields.io/circleci/build/github/csarkosh/csarko.sh.svg?label=app%20build)](https://circleci.com/gh/csarkosh/csarko.sh) [![Dockerhub Status](https://img.shields.io/docker/cloud/build/csarko/node_terraform_awscli?label=ci%20image%20build)](https://hub.docker.com/r/csarko/node_terraform_awscli/builds) [![Mozilla Observability](https://img.shields.io/mozilla-observatory/grade/csarko.sh?label=mozilla%20observatory&publish)](https://observatory.mozilla.org/analyze/csarko.sh) [![Website Status](https://img.shields.io/website/https/csarko.sh.svg)](https://csarko.sh)

This application presents my GitHub project's READMEs in a mobile-friendly dashboard.


The purpose of this project is to demonstrate my serverless-cdn architecture, provide a custom web interface overview of my public GitHub projects, and showcase my ability to build web applications.

* **Fully Automated:** Builds and deployments are fully automated and are intiated from code changes pushed to the master branch at this git repository. The automated builds and deployments include a container image for [CircleCI](https://circleci.com/) to run the builds and deployments, a [react](https://reactjs.org/) app using [create-react-app](https://facebook.github.io/create-react-app/) as the build & development tool, and various lambdas for serving HTTP requests and scraping web data.

* **Immutable Infrastructure:** All cloud infrastructure was developed and committed as code using [terraform](https://www.terraform.io/). This, paired with [git](https://git-scm.com/), was the development method used for building this application.

* **Responsive & Accessible:** The web interface is fully keyboard accessible, and the desktop view collapses into a native-looking, mobile view. This was done by using [create-react-app](https://facebook.github.io/create-react-app/) for desktop/mobile tooling and [material-ui](https://material-ui.com/) for prebuilt, accessible, web components.


[View this application's publically-available, web interface.](https://csarko.sh)

## Architecture
![Serverless-CDN Hybrid Architecture](https://csarko.sh/docs/cdn-serverless.svg) 


[Read my story on the use-cases that drove the shape of this architecture.](https://medium.com/@csarkosh/my-experience-getting-an-a-from-mozillas-observatory-tool-on-aws-f0abf12811a1)


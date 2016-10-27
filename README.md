##AMPBench: AMP URL Validation and Troubleshooting

###Guides

[Walkthrough article: Debug AMP pages with AMPBench, an open source app from the AMP Project.](https://medium.com/@greyling/ampbench-an-amp-url-validation-and-troubleshooting-application-d33ee83df604)

###What does it do?

AMPBench is a web application and service that validates AMP URLs + their associated Structured Data. 

During AMP URL validation, it builds referable, support-friendly sharable URLs such as the following:

- [https://ampbench.appspot.com/validate?url=https://ampbyexample.com/](https://ampbench.appspot.com/validate?url=https://ampbyexample.com/)

![AMPBench in action](/SCREENSHOT.png?raw=true)

###License

AMPBench is licensed under the [Apache 2.0 LICENSE](http://www.apache.org/licenses/LICENSE-2.0.txt).

###Disclaimer

AMPBench **is not** an official Google product.

###Getting the code and running it

Install [Node.js](https://nodejs.org) version 4.X on your system. E.g., [by downloading](https://nodejs.org/en/download/) or [by using a package manager](https://nodejs.org/en/download/package-manager/) or [by using NVM](https://github.com/creationix/nvm).

Now do the following from a terminal command-line session:
    
    $ git clone https://github.com/ampproject/ampbench.git
    $ cd ampbench
    $ npm update
    $ nodemon
    # or:
    $ npm start
    
Also try navigating to these links from your web browser:

- [http://localhost:8080/](http://localhost:8080/)
- [http://localhost:8080/version/](http://localhost:8080/version/)
- [http://localhost:8080/validate?url=https://ampbyexample.com/](http://localhost:8080/validate?url=https://ampbyexample.com/)
- [http://localhost:8080/api?url=https://ampbyexample.com/](http://localhost:8080/api?url=https://ampbyexample.com/)

Even try this from the command-line:

    $ curl http://localhost:8080/version/
    $ curl http://localhost:8080/raw?url=https://ampbyexample.com/
    $ curl http://localhost:8080/api?url=https://ampbyexample.com/
    $ curl http://localhost:8080/api2?url=https://ampbyexample.com/

####Requesting an AMPHTML Validator reload from the CDN ([https://cdn.ampproject.org/v0/validator.js](https://cdn.ampproject.org/v0/validator.js))

Use the following URL to ask AMPBench to reload the validator code into memory should a different (not only newer; there might have been a rollback) version be available:

    ../command_force_validator_update

For example:

- [http://localhost:8080/command_force_validator_update](http://localhost:8080/command_force_validator_update)

Or:

    $ curl http://localhost:8080/command_force_validator_update

####Utilities

AMPBench includes some useful debug utility commands that can in some cases help with troubleshooting, such as when a full validation fails on a URL by returning unexpected server responses. 

The `/debug...` commands attempt to follow fetch requests and display relevant request and response details in a similar spirit to the `curl -I [--head]...` utility.

Use these as follows in the browser:

- [https://ampbench.appspot.com/debug?url=https://ampbyexample.com](https://ampbench.appspot.com/debug?url=https://ampbyexample.com)

and:

- [https://ampbench.appspot.com/debug_curl?url=https://ampbyexample.com](https://ampbench.appspot.com/debug_curl?url=https://ampbyexample.com)

Or, with the command-line compatible `_cli` equivalents, in a terminal session:

    $ curl https://ampbench.appspot.com/debug_cli?url=https://ampbyexample.com

and:

    $ curl https://ampbench.appspot.com/debug_curl_cli?url=https://ampbyexample.com

The `/debug` and `/debug_cli` versions use a smartphone HTTP User Agent. The `/debug_curl` and `/debug_curl_cli` variants use the `curl` (desktop and server-side) User Agent. 

The applied User Agent is reported in the output and can be seen in the resulting HTTP request headers as in the following examples.

For `/debug...`:

    {"User-Agent":"Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2725.0 Mobile Safari/537.36","host":"ampbyexample.com"}

and for `/debug_curl...`:

    {"User-Agent":"curl/7.43.0","host":"ampbyexample.com"}


###Deploying AMPBench to the Cloud

####Deploying AMPBench to Google Compute Engine

To deploy AMPBench to the App Engine flexible environment, you need to have a Google Cloud Platform Console project. 

Please review the following documentation:

- [Google Cloud SDK Command-line interface for Google Cloud Platform products and services](https://cloud.google.com/sdk/)
- [gcloud Overview](https://cloud.google.com/sdk/gcloud/)
- [Initializing the SDK](https://cloud.google.com/sdk/docs/initializing)
- [Run gcloud init](https://cloud.google.com/sdk/docs/initializing#run_gcloud_init)
- [Node.js on Google Cloud Platform](https://cloud.google.com/nodejs/)
- [Quickstart for Node.js in the App Engine Flexible Environment](https://cloud.google.com/nodejs/getting-started/hello-world)
- [Deploying and running on the App Engine flexible environment](https://cloud.google.com/nodejs/getting-started/hello-world#deploy_and_run_hello_world_on_app_engine)

From within the ampbench source root folder, deplyoment to Google Compute Engine, App Engine flexible environment, should be similar to the following sequence. 

[Run gcloud init:](https://cloud.google.com/sdk/docs/initializing#run_gcloud_init)

    $ gcloud init
    
[Deploy and run:](https://cloud.google.com/nodejs/getting-started/hello-world#deploy_and_run_hello_world_on_app_engine)
    
    $ gcloud app deploy 

####Deploying AMPBench to Amazon Web Services (AWS)

AWS Elastic Beanstalk uses highly reliable and scalable services that are available in the [AWS Free Usage Tier](http://aws.amazon.com/free/) and supports apps developed in Node.js, such as AMPBench, out-of-the-box.

Please review the following documentation:

- [AWS Elastic Beanstalk](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/Welcome.html)
- [Getting Started Using Elastic Beanstalk](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/GettingStarted.html)
- [Managing and Configuring Applications and Environments Using the Console, CLI, and APIs](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/using-features.html)
- [Create an Application](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/using-features.deployment.newapp.html)
- [Deploying a Web App Using Elastic Beanstalk](http://docs.aws.amazon.com/gettingstarted/latest/deploy/overview.html)
- [Creating a Source Bundle with Git](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/using-features.deployment.source.html#using-features.deployment.source.git)

Make sure to set up AWS with your account credentials:

- [How Do I Get Security Credentials?](http://docs.aws.amazon.com/general/latest/gr/getting-aws-sec-creds.html)
- [Getting Your Access Key ID and Secret Access Key](http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSGettingStartedGuide/AWSCredentials.html)

The [Elastic Beanstalk Command Line Interface (EB CLI)](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3.html) is configured as follows:

- [Configure the EB CLI](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3-configuration.html)

From within the ampbench source root folder, deplyoment to AWS Elastic Beanstalk environment should be similar to the following:

    $ eb init # only initially or when the configuration changes
    $ eb deploy
    

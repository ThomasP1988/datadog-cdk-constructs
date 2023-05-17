/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2021 Datadog, Inc.
 */

import * as lambdaPython from "@aws-cdk/aws-lambda-python-alpha";
import { Tags } from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import log from "loglevel";
import { Transport } from "./common/transport";
import {
  applyLayers,
  redirectHandlers,
  addForwarder,
  addForwarderToLogGroups,
  applyEnvVariables,
  validateProps,
  TagKeys,
  IDatadogProps,
  DatadogStrictProps,
  handleSettingPropDefaults,
  setGitEnvironmentVariables,
  setDDEnvVariables,
} from "./index";

const versionJson = require("../version.json");

type IDatadogPropsV2 = IDatadogProps & { apiKeySecret?: ISecret };

class Datadog extends Construct {
  scope: Construct;
  props: IDatadogPropsV2;
  transport: Transport;
  constructor(scope: Construct, id: string, props: IDatadogPropsV2) {
    if (process.env.DD_CONSTRUCT_DEBUG_LOGS?.toLowerCase() == "true") {
      log.setLevel("debug");
    }
    super(scope, id);
    this.scope = scope;
    this.props = props;
    if (this.props.apiKeySecret !== undefined) {
      this.props.apiKeySecretArn = this.props.apiKeySecret.secretArn;
    }
    validateProps(this.props);
    this.transport = new Transport(
      this.props.flushMetricsToLogs,
      this.props.site,
      this.props.apiKey,
      this.props.apiKeySecretArn,
      this.props.apiKmsKey,
      this.props.extensionLayerVersion,
    );
  }

  public addLambdaFunctions(
    lambdaFunctions: (lambda.Function | lambdaNodejs.NodejsFunction | lambdaPython.PythonFunction)[],
  ) {
    // baseProps contains all properties set by the user, with default values for properties
    // defined in DefaultDatadogProps (if not set by user)
    const baseProps: DatadogStrictProps = handleSettingPropDefaults(this.props);

    if (this.props !== undefined && lambdaFunctions.length > 0) {
      if (this.props.apiKeySecret !== undefined) {
        grantReadLambdas(this.props.apiKeySecret, lambdaFunctions);
      }

      const region = `${lambdaFunctions[0].env.region}`;
      log.debug(`Using region: ${region}`);
      if (baseProps.addLayers) {
        applyLayers(
          this.scope,
          region,
          lambdaFunctions,
          this.props.pythonLayerVersion,
          this.props.nodeLayerVersion,
          this.props.javaLayerVersion,
          this.props.extensionLayerVersion,
        );
      }

      if (baseProps.redirectHandler) {
        redirectHandlers(lambdaFunctions, baseProps.addLayers);
      }

      if (this.props.forwarderArn !== undefined) {
        if (this.props.extensionLayerVersion !== undefined) {
          log.debug(`Skipping adding subscriptions to the lambda log groups since the extension is enabled`);
        } else {
          log.debug(`Adding log subscriptions using provided Forwarder ARN: ${this.props.forwarderArn}`);
          addForwarder(
            this.scope,
            lambdaFunctions,
            this.props.forwarderArn,
            this.props.createForwarderPermissions === true,
          );
        }
      } else {
        log.debug("Forwarder ARN not provided, no log group subscriptions will be added");
      }

      addCdkConstructVersionTag(lambdaFunctions);

      applyEnvVariables(lambdaFunctions, baseProps);
      setDDEnvVariables(lambdaFunctions, this.props);
      setTags(lambdaFunctions, this.props);

      this.transport.applyEnvVars(lambdaFunctions);

      if (baseProps.sourceCodeIntegration) {
        this.addGitCommitMetadata(lambdaFunctions);
      }
    }
  }

  // unused parameters gitCommitSha and gitRepoUrl are kept for backwards compatibility
  public addGitCommitMetadata(
    lambdaFunctions: (lambda.Function | lambdaNodejs.NodejsFunction | lambdaPython.PythonFunction)[],
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    gitCommitSha?: string,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    gitRepoUrl?: string,
  ) {
    setGitEnvironmentVariables(lambdaFunctions);
  }

  public addForwarderToNonLambdaLogGroups(logGroups: logs.ILogGroup[]) {
    if (this.props.forwarderArn !== undefined) {
      addForwarderToLogGroups(
        this.scope,
        logGroups,
        this.props.forwarderArn,
        this.props.createForwarderPermissions === true,
      );
    } else {
      log.debug("Forwarder ARN not provided, no non lambda log group subscriptions will be added");
    }
  }
}

export function addCdkConstructVersionTag(lambdaFunctions: lambda.Function[]) {
  log.debug(`Adding CDK Construct version tag: ${versionJson.version}`);
  lambdaFunctions.forEach((functionName) => {
    Tags.of(functionName).add(TagKeys.CDK, `v${versionJson.version}`, {
      includeResourceTypes: ["AWS::Lambda::Function"],
    });
  });
}

function setTags(lambdaFunctions: lambda.Function[], props: IDatadogProps) {
  log.debug(`Adding datadog tags`);
  lambdaFunctions.forEach((functionName) => {
    if (props.forwarderArn) {
      if (props.env) {
        Tags.of(functionName).add(TagKeys.ENV, props.env);
      }
      if (props.service) {
        Tags.of(functionName).add(TagKeys.SERVICE, props.service);
      }
      if (props.version) {
        Tags.of(functionName).add(TagKeys.VERSION, props.version);
      }
      if (props.tags) {
        const tagsArray = props.tags.split(",");
        tagsArray.forEach((tag: string) => {
          const [key, value] = tag.split(":");
          if (key && value) {
            Tags.of(functionName).add(key, value);
          }
        });
      }
    }
  });
}

function grantReadLambdas(secret: ISecret, lambdaFunctions: lambda.Function[]) {
  lambdaFunctions.forEach((functionName) => {
    secret.grantRead(functionName);
  });
}

export { Datadog, IDatadogPropsV2 };

//go:build !no_runtime_type_checking

package datadogcdkconstructsv2

import (
	"fmt"

	"github.com/aws/aws-cdk-go/awscdk/v2/awslambda"
)

func (t *jsiiProxy_Transport) validateApplyEnvVarsParameters(lambdas *[]awslambda.Function) error {
	if lambdas == nil {
		return fmt.Errorf("parameter lambdas is required, but nil was provided")
	}

	return nil
}

func (j *jsiiProxy_Transport) validateSetFlushMetricsToLogsParameters(val *bool) error {
	if val == nil {
		return fmt.Errorf("parameter val is required, but nil was provided")
	}

	return nil
}

func (j *jsiiProxy_Transport) validateSetSiteParameters(val *string) error {
	if val == nil {
		return fmt.Errorf("parameter val is required, but nil was provided")
	}

	return nil
}

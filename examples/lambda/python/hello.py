import time
import httpx
from ddtrace import tracer
from datadog_lambda.metric import lambda_metric


def lambda_handler(event, context):
    # add custom tags to the lambda function span,
    # does NOT work when X-Ray tracing is enabled
    current_span = tracer.current_span()
    if current_span:
        current_span.set_tag("customer.id", "123456")

    # submit a custom span
    with tracer.trace("hello.world"):
        print("Hello, World!")

    # submit a custom metric
    lambda_metric(
        metric_name="coffee_house.order_value",
        value=12.45,
        timestamp=int(time.time()),  # optional, must be within last 20 mins
        tags=["product:latte", "order:online"],
    )

    httpx.get("https://www.datadoghq.com")

    return {"statusCode": 200, "body": get_message()}


# trace a function
@tracer.wrap()
def get_message():
    return "Hello from CDK!"

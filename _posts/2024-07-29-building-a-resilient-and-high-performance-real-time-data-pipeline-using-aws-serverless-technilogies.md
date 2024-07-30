---
layout: post

title: "Building a resilient and high performance real-time data pipeline using AWS Serverless Technologies Part 1"

tags: [Streaming Data, AWS, Coveo, Data Platform]

author:
  name: Lucy Lu, Marie Payne
  bio: Senior Software Developers on the Data Platform
  image: llu_mpayne.png
---

At Coveo, we track how end-users interact with search interfaces by capturing client-side and server-side signals from our customers' implementations. Initially, we only collected client-side events through [Usage Analytics Write API](https://docs.coveo.com/en/1430/build-a-search-ui/use-the-usage-analytics-write-api) which implementers can use to log Click, View, Search, and Custom Events. These events are used by Coveo Machine Learning models to provide relevant and personalized experiences for end-users. These events are also used by implementers to build reports and dashboards where they can gain insights into user behaviors, and make informed decisions to optimize Coveo solutions. The diagram below shows the real-time data pipeline that receives and processes client-side events.

![Original real-time data pipeline](/images/2024-07-29-building-a-resilient-and-high-performance-real-time-data-pipeline-part-1/old_pipeline.jpg)
*Original real-time data pipeline*

<!-- more -->

Over the last few years, there has been a growing demand for real-time data analytics and applications. In addition to tracking events submitted explicitly through Usage Analytics Write API (client-side events), we also wanted to capture events from internal services (server-side events). However, it is challenging to expand the above architecture to include server-side events for the following reasons:

1. The original design of Write Service did not consider the additional data source and integrations with new real-time consumers. Expanding its existing capabilities requires a significant amount of redesign efforts.
2. Adding a data source or a consumer involves specific validation and transformation logic for incoming events. That logic can differ depending on the data source or consumer. As the number of data sources or consumers grows, the complexity of the Write Service increases, making it harder to manage and maintain which ultimately leads to increased chances of errors and failures.
3. The additional transformation logic will potentially introduce more processing time, leading to performance degradation of the Write API.

This motivated us to build a new real-time streaming pipeline that can be easily extended to adapt to new data sources from client side or server side, as well as accommodate new real-time data consumers. Beyond extensibility, there are other factors that we prioritized when designing the new real-time data pipeline, particularly:

- **Data Quality**. The quality of data is crucial to the success of any AI or ML model. Poor data quality affects outcomes of downstream applications. For example, events that collect incomplete product information affect the accuracy of the product recommendation models, which eventually results in a degraded personalization experience for end-users. Adding more data sources has the risk of compromising data quality, particularly in data consistency when different formats and standards are used. The new real-time data pipeline should have the capability to enforce standards for all events ingested, ensuring accuracy, completeness, validity, and consistency of the data delivered downstream.
- **Scalability**. The volume and velocity of events varies depending on multiple factors like time of the day, seasonal events (e.g. Black Friday), customer load testing, etc. The data pipeline should be easily scalable to handle larger volumes and to avoid data delays or any performance issues. Additionally, it should be able to scale down to save costs when data traffic is low.
- **Resilience**. Unexpected conditions, e.g. failures of third-party services, software bugs, or disruptions from data sources, can happen occasionally. Given that we receive thousands of events per second, failure to recover from these unexpected scenarios can lead to the loss of a significant number of events.

With these identified requirements, we have built a new real-time streaming data pipeline, and are continuously improving it. In this blog post, we will introduce the current state of the real-time data pipeline at Coveo, and discuss the benefits and challenges we faced. In subsequent blog posts, we will detail the strategies we’ve implemented to overcome these challenges.

# New Architecture Overview

The diagram below shows the newly built real-time data pipeline architecture at Coveo. The event service, a Kubernetes service running on EKS, acts as the entrypoint for all analytics events in our platform. It is responsible for forwarding events to a Kinesis Stream (Raw Event Stream) as quickly as possible without performing any data transformations. Raw events will then be processed by a lambda function (Enrichment Lambda) that augments information, validates against predefined schemas, and masks sensitive data in the raw events. These enriched events are forwarded to another Kinesis Stream (Enriched Event Stream). The enriched events have two consumers: a Kinesis Data Firehose which loads these enriched events into S3, and a lambda function that is able to route events to multiple streams used by different applications. After events are loaded into S3, we use Snowpipe, a service provided by Snowflake, to ingest data from S3 to our centralized data lake in Snowflake.

![New real-time data pipeline](/images/2024-07-29-building-a-resilient-and-high-performance-real-time-data-pipeline-part-1/new_data_pipline.jpg)
*New real-time data pipeline*

# How does this architecture benefit us?

## Data Quality

The Enrichment Lambda validates each event against predefined data schemas, and adds validation results to the original event. We use JSON Schema to specify constraints such as allowed values and ranges for all events ingested through the event service. Common fields (e.g. URL, userAgent, etc.) that exist in  all events share the same constraints. Event type specific data fields have their own rules. This makes sure that events in the pipeline adhere to the same standard and prevents data invalidity, incompleteness, and inconsistencies.

Enriched events will also be delivered to the Snowflake data lake, the single source of truth database that both internal users and batch processing jobs (e.g. e-commerce metrics calculation and ML model building) access. This further enhances data consistency across different use cases.

## Extensibility

Enriched events are routed to different streams through a lambda function (Router Lambda). This lambda is responsible for determining which events should be routed to which downstream Kinesis Data streams. The criteria of delivering events to a specific stream are configured through a JSON document. This document can be extended or modified if a new application needs to consume real-time events, or if the criteria need to be updated for an existing application. This flexibility allows teams to easily experiment with or build additional features on top of our real-time data. Similarly, adding a new data source simply involves adding JSON Schemas that specify constraints, eliminating the need for code changes. Compared to the original real-time pipeline, this new architecture greatly enhanced extensibility, making it much easier and safer to integrate with new data sources or consumers.

## Scalability

We chose Kinesis Data Stream, Lambda, and Kinesis Firehose provided by AWS to collect, process, and deliver events in the pipeline. Kinesis Data Stream is a streaming service that can be used to take in and process large amounts of data in real time. A Kinesis Data Stream is composed of a single or multiple shards. A shard is a base throughput unit of a stream. As each shard has a fixed unit of capacity, it is easy to predict the performance of the pipeline. The number of shards can be increased or decreased depending on the data rate and requirements.

A Lambda function can be mapped to a Kinesis Data Stream through Event Source Mapping which automatically invokes the lambda function. We can configure the number of concurrent invocations of a lambda to process one shard of a Kinesis Data Stream. Combined with the configurable shard number, we can achieve high scalability of the data pipeline. In case of increasing amounts of events, we can add more shards to a Kinesis Data stream or increase the number of concurrent invocations of Lambda to prevent throttling or performance issues.

## Resilience

A Kinesis Data Stream provides the capability to retain data records for up to 365 days. This ensures that if there is an issue preventing the invocation of Lambdas, data records remain stored in the Kinesis Stream until they expire. This mechanism guarantees that no events are lost, provided that any downstream issues are resolved within the data retention period. In addition, AWS Lambda offers robust error handling mechanisms (e.g. retry with exponential backoff) to handle runtime errors that may occur during function executions. This helps Lambda functions recover from transient errors and ensures reliable processing of events over time. Together, these capabilities offered by AWS contribute to the overall resilience and reliability of real-time data processing pipelines, minimizing the risk of data loss and maintaining system availability.

# What challenges did we have?

## Cold Starts in Lambda

Lambda cold starts occur when AWS Lambda has to initialize a new instance to process requests. During the initialization, Lambda downloads the code, prepares the execution environment, and executes any code outside of the request handler. This adds a significant latency to our data pipeline, where latency is critical. Although cold start only accounts for under 1% of requests, it disproportionately affected the overall latency of the pipeline.

## Partial Failures when sending a batch of events to a Kinesis Stream

In the Lambda that writes records to a Kinesis Stream, we can write multiple records in a single call, which can achieve much higher throughput compared to writing records individually. However, batching records can introduce the risk of partial failures, where some records in the batch succeed while others fail. When a partial failure occurs and the Lambda function retries the batch, it rewrites the entire batch or a contiguous subset of the batch, including records that were successfully written previously. This redundancy results in duplicate records being sent downstream, which can impact the accuracy and performance of real-time applications that consume these records.

## Limitations with Observability

CloudWatch is an AWS native observability tool, offering multiple features like metrics, statistics, dashboard, and logs for in-depth analysis and visualization. For all the services used in our pipeline, they automatically publish predefined metrics to CloudWatch. For instance, Lambda offers different types of metrics to measure function invocation, performance, and concurrency. However, default metrics provided by AWS give limited insights, and gaining comprehensive insights into the pipeline can be cost- and performance-prohibitive. For example, when we auto-instrumented our AWS lambda functions with OpenTelemetry, a tool widely used across other services at Coveo, we experienced an average increase of 30s in cold starts.

These challenges had long been obstacles preventing us from enhancing the performance of our real-time data pipeline. Over the past six months, the Data Platform team at Coveo conducted an extensive review of both the code and infrastructure, targeting the challenges above. In the next post, we will share our solutions of dealing with Cold Start in Lambda  and the improvements achieved. Please stay tuned!

*If you're passionate about software engineering, and you would like to work with other developers who are passionate about their work, make sure to check out our [careers](https://www.coveo.com/en/company/careers/open-positions?utm_source=tech-blog&utm_medium=blog-post&utm_campaign=organic#t=career-search&numberOfResults=9) page and apply to join the team!*
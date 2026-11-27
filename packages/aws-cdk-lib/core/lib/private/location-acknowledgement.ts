import type { IConstruct } from 'constructs';
import type { Acknowledgement } from './collect-acknowledged-rule-ids';
import { iterateDfsPreorder } from './construct-iteration';
import { enhancedStackTrace } from './stack-trace';
import type { PolicyViolatingResource } from '../validation';
import { normalizeValidationIdForAnnotations, parseValidationId } from '../validation/private/validation-id';

const LOCATION_ACKNOWLEDGED_RULES_METADATA_KEY = 'aws:cdk:location-acknowledged-rules';

interface LocationAcknowledgementData {
  readonly id: string;
  readonly reason: string;
  readonly locationPattern: string;
}

/**
 * An acknowledgement that only applies to violations at matching template locations
 */
export interface LocationAcknowledgement {
  readonly acknowledgement: Acknowledgement;
  readonly locationPattern: RegExp;
}

/**
 * Id -> construct path -> acknowledgements
 */
export type LocationAcknowledgements = Record<string, Record<string, LocationAcknowledgement[]>>;

/**
 * Acknowledge a validation rule on a construct, only for violations at template locations matching a pattern
 *
 * Unlike `Validations.acknowledge()`, this only applies to the construct itself (not to its descendants), and
 * only when every location of the violating resource matches `locationPattern`.
 */
export function acknowledgeRuleAtLocations(scope: IConstruct, id: string, reason: string, locationPattern: RegExp) {
  const data: LocationAcknowledgementData = {
    id: normalizeValidationIdForAnnotations(parseValidationId(id)),
    reason,
    locationPattern: locationPattern.source,
  };
  scope.node.addMetadata(LOCATION_ACKNOWLEDGED_RULES_METADATA_KEY, data, {
    stackTraceOverride: enhancedStackTrace(acknowledgeRuleAtLocations),
  });
}

/**
 * Collect all location-scoped acknowledgements from construct metadata across the tree
 */
export function collectLocationAcknowledgements(root: IConstruct): LocationAcknowledgements {
  const rules: LocationAcknowledgements = {};

  for (const construct of iterateDfsPreorder(root)) {
    for (const entry of construct.node.metadata) {
      if (entry.type === LOCATION_ACKNOWLEDGED_RULES_METADATA_KEY && entry.data) {
        const data = entry.data as LocationAcknowledgementData;
        const pathMap = rules[data.id] ??= {};
        (pathMap[construct.node.path] ??= []).push({
          acknowledgement: {
            reason: data.reason,
            acknowledgedId: data.id,
            acknowledgedAt: construct.node.path,
            acknowledgedStackTrace: entry.trace?.join('\n'),
          },
          locationPattern: new RegExp(data.locationPattern),
        });
      }
    }
  }
  return rules;
}

/**
 * Find a location-scoped acknowledgement on the resource's own construct path that matches all of its locations
 */
export function findLocationAcknowledgement(
  r: PolicyViolatingResource,
  pathBasedAcknowledgements: Record<string, LocationAcknowledgement[]> | undefined,
): Acknowledgement | undefined {
  if (!pathBasedAcknowledgements || r.constructPath === undefined || r.locations.length === 0) {
    return undefined;
  }
  return pathBasedAcknowledgements[r.constructPath]
    ?.find(ack => r.locations.every(l => ack.locationPattern.test(l)))
    ?.acknowledgement;
}

import { Construct } from 'constructs';
import { App, Stack } from '../../lib';
import {
  acknowledgeRuleAtLocations,
  collectLocationAcknowledgements,
  findLocationAcknowledgement,
} from '../../lib/private/location-acknowledgement';

describe('location acknowledgements', () => {
  const RULE = 'CloudFormation-Validate::W9003';

  function setup() {
    const app = new App();
    const stack = new Stack(app, 'Stack');
    const resource = new Construct(stack, 'Resource');
    const child = new Construct(resource, 'Child');
    acknowledgeRuleAtLocations(resource, RULE, 'some reason', /^Properties\.Foo\.\d+\.Bar$/);
    const acks = collectLocationAcknowledgements(app)[RULE];
    return { resource, child, acks };
  }

  test('suppresses a violation whose locations all match on the acknowledged construct', () => {
    const { resource, acks } = setup();

    const ack = findLocationAcknowledgement({
      constructPath: resource.node.path,
      locations: ['Properties.Foo.1.Bar'],
    }, acks);

    expect(ack).toEqual(expect.objectContaining({
      acknowledgedId: RULE,
      acknowledgedAt: 'Stack/Resource',
      reason: 'some reason',
    }));
  });

  test.each([
    [['Properties.Baz']],
    [['Properties.Foo.1.Bar', 'Properties.Baz']],
    [[]],
  ])('does not suppress a violation at locations %j', (locations) => {
    const { resource, acks } = setup();

    expect(findLocationAcknowledgement({ constructPath: resource.node.path, locations }, acks)).toBeUndefined();
  });

  test('does not suppress a violation of a descendant', () => {
    const { child, acks } = setup();

    expect(findLocationAcknowledgement({
      constructPath: child.node.path,
      locations: ['Properties.Foo.1.Bar'],
    }, acks)).toBeUndefined();
  });
});

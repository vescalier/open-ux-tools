import os from 'os';
import { create, Editor } from 'mem-fs-editor';
import { create as createStorage } from 'mem-fs';
import { join } from 'path';
import { generateCustomAction } from '../../src';
import { enhanceManifestAndGetActionsElementReference } from '../../src/action';
import { TargetControl } from '../../src/action/types';
import { EventHandlerConfiguration } from '../../src/common/types';

describe('CustomAction', () => {
    describe('getTargetElementReference', () => {
        const testInput = [
            { control: TargetControl.header },
            { control: TargetControl.footer },
            { control: TargetControl.section },
            { control: TargetControl.section, qualifier: 'FacetCustomAction' },
            { control: TargetControl.table },
            { control: TargetControl.table, navProperty: 'items' }
        ];
        test.each(testInput)('get reference for different control types', (input) => {
            const manifest = { 'sap.ui5': { routing: { targets: { TestPage: {} } } } };
            enhanceManifestAndGetActionsElementReference(manifest, { page: 'TestPage', ...input });
            expect(manifest).toMatchSnapshot();
        });
    });

    describe('generateCustomAction', () => {
        const testDir = '' + Date.now();
        let fs: Editor;

        const testAppManifest = JSON.stringify(
            {
                'sap.app': {
                    id: 'my.test.App'
                },
                'sap.ui5': {
                    dependencies: {
                        libs: {
                            'sap.fe.templates': {}
                        }
                    },
                    routing: {
                        targets: {
                            TestObjectPage: { name: 'sap.fe.templates.ListReport' }
                        }
                    }
                }
            },
            null,
            2
        );

        // minimal config
        const name = 'MyCustomAction';
        const target = {
            page: 'TestObjectPage',
            control: TargetControl.header
        };
        const settings = {
            text: 'My custom action text'
        };

        beforeEach(() => {
            fs = create(createStorage());
            fs.delete(testDir);
            fs.write(join(testDir, 'webapp/manifest.json'), testAppManifest);
        });

        test('minimal settings (no eventhandler)', () => {
            generateCustomAction(testDir, { name, target, settings }, fs);
            expect(fs.readJSON(join(testDir, 'webapp/manifest.json'))).toMatchSnapshot();
            expect(fs.exists(join(testDir, 'webapp/ext/myCustomAction/MyCustomAction.js'))).toBeFalsy();
        });

        test('with new event handler as string', () => {
            generateCustomAction(
                testDir,
                {
                    name,
                    target,
                    eventHandler: 'my.test.App.ext.ExistingHandler.onCustomAction',
                    settings: {
                        ...settings
                    }
                },
                fs
            );
            expect(fs.readJSON(join(testDir, 'webapp/manifest.json'))).toMatchSnapshot();
        });

        test('with existing event handler as string', () => {
            const controllerPath = 'my.test.App.ext.ExistingHandler.onCustomAction';
            fs.write(controllerPath, 'dummyContent');
            generateCustomAction(
                testDir,
                {
                    name,
                    target,
                    eventHandler: controllerPath,
                    settings: {
                        ...settings
                    }
                },
                fs
            );
            expect(fs.readJSON(join(testDir, 'webapp/manifest.json'))).toMatchSnapshot();
            expect(fs.exists(controllerPath)).toBe(true);
            expect(fs.read(controllerPath)).toEqual('dummyContent');
        });

        test('specific target folder, event handler as boolean', () => {
            generateCustomAction(
                testDir,
                {
                    name,
                    folder: 'ext',
                    target,
                    eventHandler: true,
                    settings: {
                        ...settings
                    }
                },
                fs
            );
            expect(fs.readJSON(join(testDir, 'webapp/manifest.json'))).toMatchSnapshot();
            expect(fs.read(join(testDir, 'webapp/ext/MyCustomAction.js'))).toMatchSnapshot();
        });

        test('specific control as target', () => {
            generateCustomAction(
                testDir,
                {
                    name,
                    target: {
                        page: target.page,
                        control: TargetControl.table,
                        qualifier: 'MyQualifier',
                        navProperty: 'TestItems'
                    },
                    settings
                },
                fs
            );
            expect(fs.readJSON(join(testDir, 'webapp/manifest.json'))).toMatchSnapshot();
            expect(fs.exists(join(testDir, 'webapp/ext/myCustomAction/MyCustomAction.js'))).toBeFalsy();
        });

        const requiresSelectionValues = [undefined, true, false];
        requiresSelectionValues.forEach((value?: boolean) => {
            test(`Test property "requiresSelection" with value "${value}"`, () => {
                generateCustomAction(
                    testDir,
                    {
                        name,
                        target,
                        settings: {
                            ...settings,
                            requiresSelection: value
                        }
                    },
                    fs
                );
                const manifest: any = fs.readJSON(join(testDir, 'webapp/manifest.json'));
                const action =
                    manifest['sap.ui5']['routing']['targets'][target.page]['options']['settings']['content']['header'][
                        'actions'
                    ][name];
                // "requiresSelection" property should not be added if it is undefined
                expect('requiresSelection' in action).toEqual(value === undefined ? false : true);
                expect(action['requiresSelection']).toEqual(value);
            });
        });

        describe('Test property "eventHandler"', () => {
            const generateCustomActionWithEventHandler = (
                actionId: string,
                eventHandler: string | EventHandlerConfiguration,
                folder?: string
            ) => {
                generateCustomAction(
                    testDir,
                    {
                        name: actionId,
                        target,
                        folder,
                        eventHandler,
                        settings: {
                            ...settings
                        }
                    },
                    fs
                );
            };
            const getActionByName = (manifest: any, actionId: string) => {
                return manifest['sap.ui5']['routing']['targets'][target.page]['options']['settings']['content'][
                    'header'
                ]['actions'][actionId];
            };

            test('"eventHandler" is empty "object" - create new file with default function name', () => {
                generateCustomActionWithEventHandler(name, {});

                const manifest = fs.readJSON(join(testDir, 'webapp/manifest.json'));
                const action = getActionByName(manifest, name);
                expect(action['press']).toEqual('my.test.App.ext.myCustomAction.MyCustomAction.onPress');
                expect(
                    fs.read(join(testDir, 'webapp', 'ext', 'myCustomAction', 'MyCustomAction.js'))
                ).toMatchSnapshot();
            });

            test('"eventHandler" is "object" - create new file with custom file and function names', () => {
                const extension = {
                    fnName: 'DummyOnAction',
                    fileName: 'dummyAction'
                };
                const folder = join('ext', 'custom');
                generateCustomActionWithEventHandler(name, extension, folder);

                const manifest = fs.readJSON(join(testDir, 'webapp/manifest.json'));
                const action = getActionByName(manifest, name);
                expect(action['press']).toEqual('my.test.App.ext.custom.dummyAction.DummyOnAction');
                expect(fs.read(join(testDir, 'webapp', 'ext', 'custom', `${extension.fileName}.js`))).toMatchSnapshot();
            });

            test('"eventHandler" is "object" - create new file with custom function name', () => {
                generateCustomActionWithEventHandler(name, {
                    fnName: 'DummyOnAction'
                });

                const manifest = fs.readJSON(join(testDir, 'webapp/manifest.json'));
                const action = getActionByName(manifest, name);
                expect(action['press']).toEqual('my.test.App.ext.myCustomAction.MyCustomAction.DummyOnAction');
                expect(
                    fs.read(join(testDir, 'webapp', 'ext', 'myCustomAction', 'MyCustomAction.js'))
                ).toMatchSnapshot();
            });

            test(`"eventHandler" is String - no changes to handler file`, () => {
                generateCustomActionWithEventHandler(name, 'my.test.App.ext.ExistingHandler.onCustomAction');
                const manifest = fs.readJSON(join(testDir, 'webapp', 'manifest.json'));
                const action = getActionByName(manifest, name);
                expect(action['press']).toEqual('my.test.App.ext.ExistingHandler.onCustomAction');
                expect(fs.exists(join(testDir, 'webapp', 'ext', 'myCustomAction', 'MyCustomAction.js'))).toBeFalsy();
            });

            // Test with both position interfaces
            const positions = [
                {
                    line: 8,
                    character: 9
                },
                190 + 8 * os.EOL.length
            ];
            for (const position of positions) {
                test(`"eventHandler" is object. Append new function to existing js file with position ${
                    typeof position === 'object' ? JSON.stringify(position) : 'absolute'
                }`, () => {
                    const fileName = 'MyExistingAction';
                    // Create existing file with existing actions
                    const folder = join('ext', 'fragments');
                    const existingPath = join(testDir, 'webapp', folder, `${fileName}.js`);
                    // Generate handler with single method - content should be updated during generating of custom action
                    fs.copyTpl(join(__dirname, '../../templates', 'common/EventHandler.js'), existingPath);
                    // Create third action - append existing js file
                    const actionName = 'CustomAction2';
                    const fnName = 'onHandleSecondAction';
                    generateCustomActionWithEventHandler(
                        actionName,
                        {
                            fnName,
                            fileName,
                            insertScript: {
                                fragment:
                                    ',\n        onHandleSecondAction: function() {\n            MessageToast.show("Custom handler invoked.");\n        }',
                                position
                            }
                        },
                        folder
                    );

                    const manifest = fs.readJSON(join(testDir, 'webapp', 'manifest.json'));
                    const action = getActionByName(manifest, actionName);
                    expect(action['press']).toEqual(`my.test.App.ext.fragments.${fileName}.${fnName}`);
                    // Check update js file content
                    expect(fs.read(existingPath)).toMatchSnapshot();
                });
            }
        });
    });
});

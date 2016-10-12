(function ($) {

    "use strict";

    $.fn.validation = function (method) {
        var form = $(this);
        if (!form[0]) return form;  // stop here if the form does not exist
        if (typeof(method) == 'string' && method.charAt(0) != '_' && methods[method]) {
            methods.init.apply(form);
            return methods[method].apply(form, Array.prototype.slice.call(arguments, 1));
        } else if (typeof method == 'object' || !method) {
            // default constructor with or without arguments
            methods.init.apply(form, arguments);
            return methods.bind.apply(form);
        } else {
            $.error('Method ' + method + ' does not exist in jQuery.validate');
        }
    };

    var methods = {
        init: function (options) {
            var form = this;
            if (!form.data('jqv') || form.data('jqv') == null)
                methods._saveOptions(form, options);
            return this;
        },

        bind: function (userOptions) {
            var form = this, options;
            options = userOptions ? methods._saveOptions(form, userOptions) : form.data('jqv');

            if (options.bound) {
                form.on("blur", "[class*=validate]:not([type=checkbox]):not([type=radio]):not(.datepicker)", methods._onFieldEvent);
                form.on("change", "[class*=validate][type=checkbox],[class*=validate][type=radio]", methods._onFieldEvent);
                form.on("blur", "[class*=validate][class*=datepicker]", {"delay": 300}, methods._onFieldEvent);
            }

            form.on("click", "a[class*='validate-skip'], button[class*='validate-skip'], input[class*='validate-skip']", methods._submitButtonClick);
            form.removeData('jqv_submitButton');

            // bind form.submit
            form.on("submit", methods._onSubmitEvent);
            return this;
        },
        destroy: function (userOptions) {
            var form = this, options;
            options = userOptions ? methods._saveOptions(form, userOptions) : form.data('jqv');
            // unbind fields
            form.find("[class*=validate]:not([type=checkbox]):not([type=radio])").off("blur", methods._onFieldEvent);
            form.find("[class*=validate][type=checkbox],[class*=validate][type=radio]").off("change", methods._onFieldEvent);
            form.off("click", "a[class*='validate-skip'], button[class*='validate-skip'], input[class*='validate-skip']", methods._submitButtonClick);
            form.removeData('jqv_submitButton');

            form.find("[class*=validate]").removeClass(options.addFailureCssClassToField);
            form.removeData('jqv');
            $("[class*=validate]").tooltip('destroy');
            return this;
        },
        validate: function () {
            var element = $(this);
            var valid = null;
            if (element.is('form')) {
                if (element.hasClass("validating")) {
                    return false;
                } else {
                    // form validation
                    element.addClass('validating');
                    var options = element.data('jqv');
                    valid = methods._validateFields(this);

                    // If the form doesn't validate, clear the 'validating' class before the user has a chance to submit again
                    setTimeout(function () {
                        element.removeClass('validating');
                    }, 100);
                    if (valid && options.onSuccess) {
                        options.onSuccess();
                    } else if (!valid && options.onFailure) {
                        options.onFailure();
                    }
                }
            } else if (element.is('form')) {
                element.removeClass('validating');
            } else {
                // field validation
                var form = element.closest('form'),
                    options = (form.data('jqv')) ? form.data('jqv') : $.validation.defaults
                valid = methods._validateField(element, options);
            }

            if (options.onValidationComplete) {
                // !! ensures that an undefined return is interpreted as return false but allows a onValidationComplete() to possibly return true and have form continue processing
                return !!options.onValidationComplete(form, valid);
            }
            return valid;
        },

        _saveOptions: function (form, options) {
            if ($.validationLanguage)
                var allRules = $.validationLanguage.allRules;
            else
                $.error("jQuery.validationEngine rules are not loaded, plz add localization files to the page");
            $.validation.defaults.allRules = allRules;

            var userOptions = $.extend(true, {}, $.validation.defaults, options);

            form.data('jqv', userOptions);
            return userOptions;
        },

        _onSubmitEvent: function () {
            var form = $(this);
            var options = form.data('jqv');

            //check if it is trigger from skipped button
            if (form.data("jqv_submitButton")) {
                var submitButton = $("#" + form.data("jqv_submitButton"));
                if (submitButton) {
                    if (submitButton.length > 0) {
                        if (submitButton.hasClass("validate-skip"))
                            return true;
                    }
                }
            }

            options.eventTrigger = "submit";

            // validate each field
            var r = methods._validateFields(form);

            if (!r) {
                return false;
            }

            if (options.onValidationComplete) {
                // !! ensures that an undefined return is interpreted as return false but allows a onValidationComplete() to possibly return true and have form continue processing
                return !!options.onValidationComplete(form, r);
            }
            return r;
        },
        _onFieldEvent: function (event) {
            var field = $(this);
            var form = field.closest('form');

            var options = form.data('jqv');
            if (!options)
                options = methods._saveOptions(form, options);
            options.eventTrigger = "field";

            // validate the current field
            window.setTimeout(function () {
                methods._validateField(field, options);
            }, (event.data) ? event.data.delay : 0);

            if (options.notEmpty == true) {
                if (field.val().length > 0) {
                    // validate the current field
                    window.setTimeout(function () {
                        methods._validateField(field, options);
                    }, (event.data) ? event.data.delay : 0);
                }
            } else {
                // validate the current field
                window.setTimeout(function () {
                    methods._validateField(field, options);
                }, (event.data) ? event.data.delay : 0);
            }
        },

        _validateFields: function (form) {
            var options = form.data('jqv');

            // this variable is set to true if an error is found
            var errorFound = false;

            // Trigger hook, start validation
            form.trigger("jqv.form.validating");
            var first_err = null;
            form.find('[class*=validate]').not(":disabled").each(function () {
                var field = $(this);
                var names = [];
                if ($.inArray(field.attr('name'), names) < 0) {
                    errorFound |= methods._validateField(field, options);
                    if (errorFound && first_err == null)
                        first_err = field;
                    names.push(field.attr('name'));
                }
            });
            if (errorFound) {
                return false;
            }
            return true;
        },

        _validateField: function (field, options) {

            var rulesParsing = field.attr("class");
            var getRules = /validate\[(.*)\]/.exec(rulesParsing);

            if (!getRules)
                return false;
            var str = getRules[1];
            var rules = str.split(/\[|,|\]/);

            var promptText = "";

            var form = $(field.closest("form"));
            // Fix for adding spaces in the rules
            for (var i = 0; i < rules.length; i++) {
                rules[i] = rules[i].replace(" ", "");
                // Remove any parsing errors
                if (rules[i] === '') {
                    delete rules[i];
                }
            }
            for (var i = 0,field_errors = 0 ; i < rules.length; i++) {

                var errorMsg = undefined;
                switch (rules[i]) {
                    case "required":
                        errorMsg = methods._getErrorMessage(form, field, rules[i], rules, i, options, methods._required);
                        break;
                    case "custom":
                        errorMsg = methods._getErrorMessage(form, field, rules[i], rules, i, options, methods._custom);
                        break;
                    default:
                }
                // If we have a string, that means that we have an error, so add it to the error message.
                if (typeof errorMsg == 'string') {
                    promptText += errorMsg + ";";
                    options.isError = true;
                    field_errors++;
                }
            }
            if (field_errors < 1)
                options.isError = false;

            methods._updatePrompt(form, field, promptText, options);
            return options.isError;
        },

        _submitButtonClick: function () {
            var button = $(this);
            var form = button.closest('form');
            form.data("jqv_submitButton", button.attr("id"));
        },
        _required: function (field, rules, i, options) {
            switch (field.prop("type")) {
                case "text":
                case "password":
                case "textarea":
                case "file":
                case "select-one":
                case "select-multiple":
                default:
                    var field_val = $.trim(field.val());
                    if (!field_val) {
                        return options.allRules[rules[i]].alertText;
                    }
                    break;
                case "radio":
                case "checkbox":
                    // new validation style to only check dependent field
                    var form = field.closest("form");
                    var name = field.attr("name");
                    if (form.find("input[name='" + name + "']:checked").size() == 0) {
                        if (form.find("input[name='" + name + "']:visible").size() == 1)
                            return options.allRules[rules[i]].alertTextCheckboxe;
                        else
                            return options.allRules[rules[i]].alertTextCheckboxMultiple;
                    }
                    break;
            }
        },

        _custom: function (field, rules, i, options) {
            var customRule = rules[i + 1];
            var rule = options.allRules[customRule];
            if (!rule) {
                alert("jqv:custom rule not found - " + customRule);
                return;
            }
            if (rule["regex"]) {
                var ex = rule.regex;
                if (!ex) {
                    alert("jqv:custom regex not found - " + customRule);
                    return;
                }
                var pattern = new RegExp(ex);
                if (!pattern.test(field.val())) return options.allRules[customRule].alertText;
            } else {
                alert("jqv:custom type not allowed " + customRule);
                return;
            }
        },

        _getErrorMessage: function (form, field, rule, rules, i, options, originalValidationMethod) {
            return originalValidationMethod(field, rules, i, options);
        },
        _updatePrompt: function (form, field, promptText, options) {
            var fieldType = field.prop("type");
            var fieldName = field.attr("name");


            if (fieldType == "radio" || fieldType == "checkbox") {
                field = $(form.find("input[name='" + fieldName + "'][type!=hidden]:last").parents("div.form-group"));
                field.removeClass("has-error");
                if (options.isError) {
                    field.addClass("has-error");
                    field.attr("title", promptText);
                }
            } else {
                if (options.addFailureCssClassToField)
                    field.removeClass(options.addFailureCssClassToField);
                field.attr("title", "");
                if (options.isError) {
                    field.attr("title", promptText);
                    if (options.addFailureCssClassToField)
                        field.addClass(options.addFailureCssClassToField);
                }
            }
        }
    };

    $.validation = {
        defaults: {
            allRules: {},
            // true if you want to validate the input fields on blur event
            bound: true,
            // set to true if you want to validate the input fields on blur only if the field it's not empty
            notEmpty: false,

            addFailureCssClassToField: "error",
            isError: false,

            InvalidFields: [],
            onValidationComplete: false,
            onFieldSuccess: false,
            onFieldFailure: false,
            onSuccess: false,
            onFailure: false
        }
    };

})(jQuery);

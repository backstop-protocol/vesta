import React, {Component} from "react";
import ViewIcon from "../../assets/view-icon.svg";
import BIcon from "../../assets/b-icon.svg";
import VIcon from "../../assets/v-icon.svg";
import XIcon from "../../assets/red-x-icon.svg";

export default class Deposit extends Component {

    render() {

        const {actioning, value, currency, completed, failed} = this.props;

        const icon = completed ? VIcon : (failed ? XIcon : BIcon);
        const iconClsName = (completed || failed ? 'result':'loading-indicator');

        const resultText = completed ? 'Completed' : (failed ? 'Failed' : '');

        return (
            <div className="currency-action-panel centered">
                <h3>
                    <img className={iconClsName} src={icon} />

                    <span>{actioning} {value} {currency}... {resultText}</span></h3>
                {!failed && <div className="view-button">
                    <a href="#">
                        <span>View</span>
                        <img src={ViewIcon} />
                    </a>
                </div>}
            </div>
        )
    }
}
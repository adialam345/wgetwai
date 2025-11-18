import { DataTypes } from "sequelize";
import { sequelize } from "../../config/Database.js";

const CallbackSetting = sequelize.define(
	"CallbackSetting",
	{
		session_name: {
			type: DataTypes.STRING,
			primaryKey: true,
			allowNull: false,
		},
		callback_url: {
			type: DataTypes.TEXT,
			allowNull: false,
		},
		callback_token: {
			type: DataTypes.STRING,
			allowNull: true,
		},
	},
	{ tableName: "callback_settings", timestamps: true }
);

CallbackSetting.removeAttribute("id");

export default CallbackSetting;

